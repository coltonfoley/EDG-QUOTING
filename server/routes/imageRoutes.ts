import type { Express } from "express";
import { get as getBlob, list as listBlobs } from "@vercel/blob";
import { isAuthenticated } from "../auth";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  getObjectStorageProvider,
  objectStorageClient,
} from "../objectStorage";
import { ObjectPermission } from "../objectAcl";
import {
  uploadUrlSchema,
  finalizeUploadSchema,
  imageProxySchema
} from "../validation-schemas";

export function registerImageRoutes(app: Express) {
  // Get upload URL for image uploads
  app.post("/api/images/upload-url", isAuthenticated, async (req, res) => {
    try {
      // Validate request body
      const validatedData = uploadUrlSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }
      
      const { imageType, filename } = validatedData.data;
      
      const objectStorageService = new ObjectStorageService();
      // Create a custom path based on image type and filename
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const customPath = `${imageType}s/${timestamp}-${sanitizedFilename}`;
      
      const uploadTarget = await objectStorageService.getObjectEntityUploadTarget(customPath, {
        allowedContentTypes: ["image/*"],
        maximumSizeInBytes: 100 * 1024 * 1024,
      });
      
      console.log(`🔧 Generated upload target for ${imageType}: ${uploadTarget.objectPath}`);
      
      if (uploadTarget.provider === "replit") {
        return res.json({
          uploadMode: uploadTarget.uploadMode,
          uploadUrl: uploadTarget.uploadUrl,
          objectPath: uploadTarget.objectPath,
          publicUrl: `${req.protocol}://${req.get('host')}/objects${uploadTarget.objectPath.replace('/objects', '')}`
        });
      }

      res.json({
        uploadMode: uploadTarget.uploadMode,
        clientToken: uploadTarget.clientToken,
        objectPath: uploadTarget.objectPath,
        pathname: uploadTarget.pathname,
      });
    } catch (error) {
      console.error("❌ Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // Set ACL policy after successful upload + normalize image with Sharp
  app.post("/api/images/finalize-upload", isAuthenticated, async (req, res) => {
    try {
      // Validate request body
      const validatedData = finalizeUploadSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }
      
      const { objectPath } = validatedData.data;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "User authentication required" });
      }
      
      const objectStorageService = new ObjectStorageService();
      const provider = getObjectStorageProvider();

      if (provider === "vercel-blob") {
        const uploadedObject = await objectStorageService.getPublicObjectEntityMetadata(objectPath);
        let publicUrl = uploadedObject.publicUrl;
        let normalizedObjectPath = uploadedObject.objectPath;

        try {
          console.log(`📥 Downloading Vercel Blob image for normalization: ${uploadedObject.objectPath}`);
          if (!uploadedObject.publicUrl) {
            throw new Error("Vercel Blob public URL was not available.");
          }

          const response = await fetch(uploadedObject.publicUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch uploaded image: ${response.status} ${response.statusText}`);
          }

          const fileContents = Buffer.from(await response.arrayBuffer());

          console.log(`🔧 Normalizing Vercel Blob image with Sharp...`);
          const { default: sharp } = await import("sharp");
          const normalizedBuffer = await sharp(fileContents)
            .rotate()
            .resize({
              width: 1600,
              height: 1200,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();

          const normalizedObject = await objectStorageService.uploadPublicObjectEntityBuffer(
            uploadedObject.objectPath,
            normalizedBuffer,
            { contentType: 'image/jpeg' }
          );

          publicUrl = normalizedObject.publicUrl ?? publicUrl;
          normalizedObjectPath = normalizedObject.objectPath;
          console.log(`✅ Vercel Blob image normalized and saved`);
        } catch (normalizeError) {
          console.warn(`⚠️ Vercel Blob image normalization failed, proceeding with uploaded original:`, normalizeError);
        }

        return res.json({
          success: true,
          objectPath: normalizedObjectPath,
          publicUrl,
        });
      }

      try {
        // 1. Download the uploaded image from object storage
        console.log(`📥 Downloading image for normalization: ${objectPath}`);
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        const [fileContents] = await objectFile.download();
        
        // 2. Normalize the image with Sharp (auto-orient + quality optimization)
        console.log(`🔧 Normalizing image with Sharp...`);
        const { default: sharp } = await import("sharp");
        const normalizedBuffer = await sharp(fileContents)
          .rotate() // Auto-orient based on EXIF data - THIS FIXES THE ROTATION ISSUE
          .resize({
            width: 1600,
            height: 1200,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
        
        // 3. Re-upload the normalized image to the same location
        console.log(`📤 Re-uploading normalized image...`);
        await objectFile.save(normalizedBuffer, {
          contentType: 'image/jpeg',
          metadata: {
            cacheControl: 'public, max-age=31536000',
          },
        });
        
        console.log(`✅ Image normalized and saved`);
      } catch (normalizeError) {
        console.warn(`⚠️ Image normalization failed, proceeding without normalization:`, normalizeError);
        // Continue with ACL setup even if normalization fails
      }
      
      // 4. Set ACL policy - making images public for now (quotes are shareable)
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        {
          owner: String(userId),
          visibility: "public", // Images in quotes should be publicly accessible
        }
      );
      
      console.log(`✅ Finalized upload: ${normalizedPath}`);
      
      res.json({
        success: true,
        objectPath: normalizedPath,
        publicUrl: `${req.protocol}://${req.get('host')}${normalizedPath}`
      });
    } catch (error) {
      console.error("❌ Error finalizing upload:", error);
      res.status(500).json({ message: "Failed to finalize upload" });
    }
  });

  // Serve quote images without auth (for PDF generation and previews)
  app.get("/quote-images/:filename", async (req, res) => {
    try {
      const { filename } = req.params;

      if (getObjectStorageProvider() === "vercel-blob") {
        const pathname = await findVercelBlobQuoteImagePath(filename);
        if (!pathname) {
          return res.status(404).json({ message: "Image not found" });
        }

        const blob = await getBlob(pathname, { access: "public" });
        if (!blob || blob.statusCode !== 200 || !blob.stream) {
          return res.status(404).json({ message: "Image not found" });
        }

        const buffer = await readBlobStream(blob.stream);
        res.setHeader("Content-Type", blob.blob.contentType || "application/octet-stream");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(buffer);
        return;
      }

      const objectStorageService = new ObjectStorageService();
      
      // Get the bucket and list files to find the one ending with our filename
      const privateDir = objectStorageService.getPrivateObjectDir();
      const directories = ['cover-photos', 'product-renderings'];
      
      for (const dir of directories) {
        try {
          const bucketName = privateDir.split('/')[1]; // Extract bucket name
          const bucket = objectStorageClient.bucket(bucketName);
          const prefix = `${privateDir.split('/').slice(2).join('/')}/${dir}/`;
          
          const [files] = await bucket.getFiles({ prefix });
          
          // Look for a file that ends with our filename
          const matchingFile = files.find(file => file.name.endsWith(filename));
          if (matchingFile) {
            // Get file metadata for proper headers
            const [metadata] = await matchingFile.getMetadata();
            
            // Set CORS and caching headers for PDF generation
            res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            // Stream the file to the response
            const stream = matchingFile.createReadStream();
            stream.pipe(res);
            return;
          }
        } catch (error: any) {
          continue;
        }
      }
      
      res.status(404).json({ message: "Image not found" });
    } catch (error) {
      console.error("Error serving quote image:", error);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  // Serve uploaded objects (with ACL check)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${req.params.objectPath}`);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: String(userId),
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Image proxy endpoint to bypass CORS for object storage images
  app.get("/api/image-proxy", isAuthenticated, async (req, res) => {
    try {
      // Validate query parameters
      const validatedData = imageProxySchema.safeParse(req.query);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: validatedData.error.errors 
        });
      }
      
      const imageUrl = validatedData.data.url;
      
      console.log(`🔧 Proxying image request: ${imageUrl}`);
      
      // If it's an internal objects URL, handle directly
      if (imageUrl.includes('/objects/')) {
        const objectPath = imageUrl.split('/objects/')[1];
        const objectStorageService = new ObjectStorageService();
        try {
          const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${objectPath}`);
          await objectStorageService.downloadObject(objectFile, res);
          return;
        } catch (error) {
          console.error(`❌ Failed to serve internal object: ${error}`);
          return res.status(404).json({ message: "Object not found" });
        }
      }
      
      // Fetch the image from external object storage
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        console.error(`❌ Failed to fetch image: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ message: `Failed to fetch image: ${response.statusText}` });
      }
      
      // Get the image data as buffer
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      
      console.log(`✅ Successfully proxied image: ${imageUrl} (${buffer.byteLength} bytes, ${contentType})`);
      
      // Set appropriate headers and send the image
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.byteLength.toString());
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      res.send(Buffer.from(buffer));
      
    } catch (error) {
      console.error("❌ Image proxy error:", error);
      res.status(500).json({ message: "Failed to proxy image" });
    }
  });

  const BRAND_ASSET_MAP: Record<string, { objectPath: string; contentType: string }> = {
    "brand-cover.jpg": { objectPath: "brand-assets/brand-cover.jpg", contentType: "image/jpeg" },
    "brand-logo.png": { objectPath: "brand-assets/brand-logo.png", contentType: "image/png" },
    "brand-back.jpg": { objectPath: "brand-assets/brand-back.jpg", contentType: "image/jpeg" },
  };

  async function readBlobStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
        byteLength += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks, byteLength);
  }

  async function findVercelBlobQuoteImagePath(filename: string): Promise<string | null> {
    const decodedFilename = decodeURIComponent(filename);
    const prefixes = [
      "cover-photos/",
      "product-renderings/",
      "rainmaker-migrated/quote-cover-photos/",
      "rainmaker-migrated/quote-product-renderings/",
    ];

    for (const prefix of prefixes) {
      let cursor: string | undefined;

      do {
        const result = await listBlobs({ prefix, cursor, limit: 1000 });
        const match = result.blobs.find((blob) => {
          return blob.pathname.endsWith(filename)
            || blob.pathname.endsWith(decodedFilename)
            || blob.pathname === filename
            || blob.pathname === decodedFilename;
        });

        if (match) {
          return match.pathname;
        }

        cursor = result.hasMore ? result.cursor : undefined;
      } while (cursor);
    }

    return null;
  }

  app.get("/api/brand-assets/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const asset = BRAND_ASSET_MAP[filename];
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }

      let buffer: Buffer;

      if (getObjectStorageProvider() === "vercel-blob") {
        const blob = await getBlob(asset.objectPath, { access: "public" });
        if (!blob || blob.statusCode !== 200 || !blob.stream) {
          return res.status(404).json({ message: "Asset not found in storage" });
        }

        buffer = await readBlobStream(blob.stream);
      } else {
        const objectStorageService = new ObjectStorageService();
        const file = await objectStorageService.searchPublicObject(asset.objectPath);
        if (!file) {
          return res.status(404).json({ message: "Asset not found in storage" });
        }

        const [downloadedBuffer] = await file.download();
        buffer = downloadedBuffer;
      }

      if (req.query.raw === "1") {
        res.setHeader("Content-Type", asset.contentType);
        res.setHeader("Content-Length", buffer.byteLength.toString());
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
      }

      const base64 = buffer.toString("base64");
      const prefix = asset.contentType === "image/png" ? "data:image/png;base64," : "data:image/jpeg;base64,";

      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json({ dataUri: prefix + base64 });
    } catch (error) {
      console.error("Error serving brand asset:", error);
      res.status(500).json({ message: "Failed to load brand asset" });
    }
  });
}
