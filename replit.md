# Rainmaker, by EDG - Construction Quote Management System

## Overview
Rainmaker, by EDG is a full-stack web application designed for EDG to create, manage, and track project quotes. It provides a comprehensive solution for generating detailed construction estimates, managing customer information, maintaining a product catalog, and tracking the quote lifecycle. The system aims to streamline the quoting process, improve accuracy, and provide robust financial tracking, including margin and profit visibility.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Design System**: shadcn/ui components built on Radix UI primitives.
- **Styling**: Tailwind CSS with a custom construction-themed color palette (Black/White/Teal) and EDG branding.
- **Templates**: Editable PDF quote template with company branding and customizable terms.
- **User Interface Components**:
    - **Quote Builder**: Form-based creation, customer/project details.
    - **Line Items Table**: Dynamic table for adding/editing line items with product catalog integration.
    - **Product Catalog**: Full CRUD interface for managing reusable products and services.
    - **Quote Summary**: Financial calculations and status management.
    - **Dashboard**: Overview of all quotes with filtering, status indicators, and comprehensive margin/profit tracking.
    - **Navigation**: Professional header with active page indicators.

### Technical Implementations
- **Frontend**: React 18 with TypeScript, Wouter for routing, TanStack Query for state management, Vite for builds.
- **Backend**: Node.js with Express.js, TypeScript with ES modules.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations, hosted on Neon Database (serverless).
- **API Design**: RESTful API with JSON responses.
- **Data Models**: Customers, Quotes, Products, and Line Items.
    - **Customer Management**: Name, email, phone, and company storage.
    - **Quote Management**: Project details, status tracking (draft/sent/approved/rejected), tax and discount handling, automatic unique quote numbering, and financial calculations (subtotal, tax, discount, markup).
    - **Product Catalog**: Reusable products with categories, default pricing, units, and flexible markup settings (percentage or fixed dollar, including negative markups/markdowns).
    - **Line Item System**: Individual cost items within quotes, supporting taxable/non-taxable flags and markup calculations.
- **Business Logic**:
    - **Quote Number Generation**: Automatic unique numbering.
    - **Financial Calculations**: Subtotal, tax, discount, and markup calculations, including correct weighted average for margin/profit tracking.
    - **Status Workflow**: Quote lifecycle management.
    - **Data Flow**: Quote creation, line item management, markup application, financial calculation, status tracking, and data persistence to PostgreSQL.

### System Design Choices
- **Monorepo Structure**: Shared TypeScript types between frontend and backend for full-stack type safety.
- **Deployment**: Configured for Replit, with `npm run dev` for development and optimized production builds.
- **Error Handling**: Robust validation and error management, including silent handling of navigation-triggered aborts.
- **Performance**: Optimized line item rendering and React Query cache invalidation strategy.
- **Key Features**:
    - Search functionality for quotes and product catalog.
    - Customizable PDF generation with company branding.
    - Email integration for sending quotes and e-signature links.
    - Bulk product adjustment and price list uploading.
    - Cost tracking for true margin visibility in imported items.
    - **Product Configurator System**: Manufacturer-specific configurators (Sundance catalog-style) that insert grouped line items with complete product snapshots stored in configData for historical accuracy. Cache invalidation pattern requires invalidating both quote and groups queries.

## External Dependencies

- **Frontend**:
    - **React Query**: Server state management and caching.
    - **React Hook Form**: Form handling with Zod validation.
    - **Wouter**: Lightweight React router.
    - **shadcn/ui**: Pre-built accessible UI components.
    - **Tailwind CSS**: Utility-first CSS framework.
- **Backend**:
    - **Drizzle ORM**: Type-safe database toolkit.
    - **Neon Database**: Serverless PostgreSQL provider.
    - **Express.js**: Web application framework.
    - **Zod**: Runtime type validation.
- **Development Tools**:
    - **TypeScript**: Type safety across the stack.
    - **Vite**: Fast development server and build tool.
    - **ESBuild**: JavaScript bundler for production.
- **Integrations**:
    - **QuickBooks**: API integration for creating Estimates.
    - **Gmail connector**: For sending emails with quote details and signing links.
    - **html2canvas and jsPDF**: For client-side PDF generation.
- **PDF Image Pipeline** (`client/src/lib/pdf-image-pipeline.ts`):
    - **EXIF Orientation Handling**: Comprehensive solution for fixing sideways phone photos in PDFs
        - Reads JPEG EXIF orientation tags (1-8) directly from binary data
        - Applies manual canvas transformations for all 8 orientation values
        - Dual-path optimization: fast ImageBitmap for normal images, manual rotation for rotated images
        - Works consistently across all browsers, including Safari/iOS where createImageBitmap ignores imageOrientation
        - Image caching with normalizeImageToDataUrl prevents repeated conversions
    - **Image Processing**: Aspect-fit sizing preserves natural image proportions in PDFs
    - **Dimension Calculation**: Returns post-rotation dimensions (swaps width/height for 90° rotations)