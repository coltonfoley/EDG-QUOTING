import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

declare global {
  interface Window {
    google: any;
    googleMapsLoading?: boolean;
    googleMapsLoaded?: boolean;
  }
}

interface AddressComponents {
  streetAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  placeId: string;
}

interface AddressAutocompleteProps {
  onAddressSelect: (components: AddressComponents) => void;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
}

const loadGooglePlacesScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (window.googleMapsLoaded && window.google?.maps) {
      resolve();
      return;
    }

    // Already loading
    if (window.googleMapsLoading) {
      const checkInterval = setInterval(() => {
        if (window.googleMapsLoaded && window.google?.maps) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      reject(new Error("Google Places API key is not configured"));
      return;
    }

    window.googleMapsLoading = true;

    // Use the new bootstrap loader approach
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      // Wait for google.maps to be fully initialized
      const checkGoogleMaps = () => {
        if (window.google?.maps?.importLibrary) {
          window.googleMapsLoaded = true;
          window.googleMapsLoading = false;
          console.log("Google Maps API with importLibrary loaded successfully");
          resolve();
        } else if (window.google?.maps) {
          // Old API loaded, try to wait a bit more
          setTimeout(checkGoogleMaps, 100);
        } else {
          window.googleMapsLoading = false;
          reject(new Error("Google Maps API loaded but google.maps is not available"));
        }
      };
      checkGoogleMaps();
    };
    
    script.onerror = () => {
      window.googleMapsLoading = false;
      reject(new Error("Failed to load Google Places API"));
    };

    document.head.appendChild(script);
  });
};

export function AddressAutocomplete({
  onAddressSelect,
  placeholder = "Start typing an address...",
  disabled = false,
  testId = "input-address-autocomplete"
}: AddressAutocompleteProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteElementRef = useRef<any>(null);

  useEffect(() => {
    setIsLoading(true);
    loadGooglePlacesScript()
      .then(() => {
        setIsScriptLoaded(true);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        console.error(err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!isScriptLoaded || !containerRef.current || disabled) return;

    let cleanup: (() => void) | null = null;

    const initAutocomplete = async () => {
      try {
        // Verify google.maps is available
        if (!window.google || !window.google.maps) {
          throw new Error("Google Maps API not loaded");
        }
        
        // Import the places library
        const placesLib = await window.google.maps.importLibrary("places");

        // Create the new PlaceAutocompleteElement
        const placeAutocomplete = new (window.google.maps.places as any).PlaceAutocompleteElement({
          includedRegionCodes: ["us"]
        });

        // Store reference
        autocompleteElementRef.current = placeAutocomplete;

        // Add to container
        if (containerRef.current) {
          containerRef.current.appendChild(placeAutocomplete);
        }

        // Listen for place selection with the correct event name
        const handlePlaceSelect = async (event: any) => {
          try {
            // Handle both possible event structures
            const placePrediction = event.placePrediction || event.detail?.place || event.detail?.placePrediction;
            if (!placePrediction) {
              console.warn("No place prediction found in event:", event);
              return;
            }

            // Convert to Place object
            const place = placePrediction.toPlace ? placePrediction.toPlace() : placePrediction;

            // Fetch the fields we need
            await place.fetchFields({
              fields: ["addressComponents", "formattedAddress", "id"]
            });

            const addressComponents = place.addressComponents;
            if (!addressComponents) return;

            const components: AddressComponents = {
              streetAddress: "",
              addressLine2: "",
              city: "",
              state: "",
              zipCode: "",
              country: "",
              placeId: place.id || ""
            };

            let streetNumber = "";
            let route = "";
            let subpremise = "";

            addressComponents.forEach((component: any) => {
              const types = component.types;

              if (types.includes("street_number")) {
                streetNumber = component.longText;
              }
              if (types.includes("route")) {
                route = component.longText;
              }
              if (types.includes("subpremise")) {
                subpremise = component.longText;
              }
              if (types.includes("locality")) {
                components.city = component.longText;
              }
              if (types.includes("administrative_area_level_1")) {
                components.state = component.shortText;
              }
              if (types.includes("postal_code")) {
                components.zipCode = component.longText;
              }
              if (types.includes("country")) {
                components.country = component.longText;
              }
            });

            components.streetAddress = `${streetNumber} ${route}`.trim();
            if (subpremise) {
              components.addressLine2 = subpremise;
            }

            onAddressSelect(components);
          } catch (err) {
            console.error("Error processing place selection:", err);
          }
        };

        placeAutocomplete.addEventListener("gmp-select", handlePlaceSelect);

        cleanup = () => {
          placeAutocomplete.removeEventListener("gmp-select", handlePlaceSelect);
          if (containerRef.current && autocompleteElementRef.current) {
            try {
              containerRef.current.removeChild(autocompleteElementRef.current);
            } catch (e) {
              // Element might already be removed
            }
          }
          autocompleteElementRef.current = null;
        };
      } catch (error) {
        console.error("Error initializing Google Places Autocomplete:", error);
        console.error("Error details:", error instanceof Error ? error.message : String(error));
        console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
        setError("Failed to initialize address autocomplete");
      }
    };

    initAutocomplete();

    return () => {
      if (cleanup) cleanup();
    };
  }, [isScriptLoaded, onAddressSelect, disabled]);

  if (error) {
    return (
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          disabled={disabled}
          data-testid={testId}
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {!isScriptLoaded ? (
        <div className="relative">
          <Input
            type="text"
            placeholder="Loading address autocomplete..."
            disabled
            data-testid={testId}
            className="pr-10"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      ) : (
        <div 
          ref={containerRef} 
          data-testid={testId} 
          className="w-full [&_input]:w-full [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:rounded-md [&_input]:border [&_input]:border-input [&_input]:bg-background [&_input]:ring-offset-background [&_input]:placeholder:text-muted-foreground [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-ring [&_input]:focus-visible:ring-offset-2"
        />
      )}
    </div>
  );
}
