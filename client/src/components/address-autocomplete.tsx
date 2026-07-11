import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

declare global {
  interface Window {
    google: any;
    googleMapsLoading?: boolean;
    googleMapsLoaded?: boolean;
    __rainmakerGoogleMapsInit?: () => void;
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
  ariaLabel?: string;
  disabled?: boolean;
  testId?: string;
}

const loadGooglePlacesScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (window.googleMapsLoaded && window.google?.maps?.places?.Autocomplete) {
      resolve();
      return;
    }

    // Already loading
    if (window.googleMapsLoading) {
      const checkInterval = setInterval(() => {
        if (window.googleMapsLoaded && window.google?.maps?.places?.Autocomplete) {
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

    window.__rainmakerGoogleMapsInit = () => {
      if (window.google?.maps?.places?.Autocomplete) {
        window.googleMapsLoaded = true;
        window.googleMapsLoading = false;
        resolve();
        return;
      }

      window.googleMapsLoading = false;
      reject(new Error("Google Places API loaded but places autocomplete is not available"));
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=__rainmakerGoogleMapsInit`;
    script.async = true;
    script.defer = true;

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
  ariaLabel = "Search for an address",
  disabled = false,
  testId = "input-address-autocomplete"
}: AddressAutocompleteProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

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
    const input = inputRef.current;
    if (!isScriptLoaded || !input || disabled) return;

    let placeChangedListener: any = null;

    const initAutocomplete = async () => {
      try {
        if (!window.google || !window.google.maps) {
          throw new Error("Google Maps API not loaded");
        }

        const autocomplete = new window.google.maps.places.Autocomplete(input, {
          componentRestrictions: { country: "us" },
          fields: ["address_components", "formatted_address", "place_id"],
          types: ["address"]
        });

        autocompleteRef.current = autocomplete;

        placeChangedListener = autocomplete.addListener("place_changed", () => {
          try {
            const place = autocomplete.getPlace();
            const addressComponents = place.address_components;
            if (!addressComponents) return;

            const components: AddressComponents = {
              streetAddress: "",
              addressLine2: "",
              city: "",
              state: "",
              zipCode: "",
              country: "",
              placeId: place.place_id || ""
            };

            let streetNumber = "";
            let route = "";
            let subpremise = "";

            addressComponents.forEach((component: any) => {
              const types = component.types;

              if (types.includes("street_number")) {
                streetNumber = component.long_name;
              }
              if (types.includes("route")) {
                route = component.long_name;
              }
              if (types.includes("subpremise")) {
                subpremise = component.long_name;
              }
              if (types.includes("locality")) {
                components.city = component.long_name;
              }
              if (types.includes("administrative_area_level_1")) {
                components.state = component.short_name;
              }
              if (types.includes("postal_code")) {
                components.zipCode = component.long_name;
              }
              if (types.includes("country")) {
                components.country = component.long_name;
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
        });
      } catch (error) {
        console.error("Error initializing Google Places Autocomplete:", error);
        console.error("Error details:", error instanceof Error ? error.message : String(error));
        console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
        setError("Failed to initialize address autocomplete");
      }
    };

    initAutocomplete();

    return () => {
      if (placeChangedListener) {
        placeChangedListener.remove();
      }
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
  }, [isScriptLoaded, onAddressSelect, disabled]);

  if (error) {
    return (
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          aria-label={ariaLabel}
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
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder={isScriptLoaded ? placeholder : "Loading address autocomplete..."}
          aria-label={ariaLabel}
          disabled={disabled || !isScriptLoaded}
          data-testid={testId}
          autoComplete="new-password"
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {!isScriptLoaded || isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}
