import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

declare global {
  interface Window {
    google: typeof google;
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
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (components: AddressComponents) => void;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = "Start typing an address...",
  disabled = false,
  testId = "input-address-autocomplete"
}: AddressAutocompleteProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      console.error("Google Places API key is not configured");
      return;
    }

    if (window.google?.maps?.places) {
      setIsScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      setIsScriptLoaded(true);
    };
    
    script.onerror = () => {
      console.error("Failed to load Google Places API");
    };

    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (!isScriptLoaded || !inputRef.current) return;

    try {
      autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["address_components", "formatted_address", "place_id"]
      });

      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace();
        
        if (!place || !place.address_components) {
          return;
        }

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

        place.address_components.forEach((component) => {
          const types = component.types;

          if (types.includes("street_number")) {
            streetNumber = component.long_name;
          }
          if (types.includes("route")) {
            route = component.long_name;
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
        
        const formattedAddress = place.formatted_address || components.streetAddress;
        onChange(formattedAddress);
        onAddressSelect(components);
      });
    } catch (error) {
      console.error("Error initializing Google Places Autocomplete:", error);
    }

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [isScriptLoaded, onChange, onAddressSelect]);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled || !isScriptLoaded}
        data-testid={testId}
        className="pr-10"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isScriptLoaded ? (
          <MapPin className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
