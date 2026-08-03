export interface AddressComponents {
  formattedAddress: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  placeId: string;
}

type GooglePlaceSelection = {
  formatted_address?: string;
  place_id?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
};

export function addressComponentsFromPlace(place: GooglePlaceSelection): AddressComponents | null {
  if (!place.address_components) return null;

  const components: AddressComponents = {
    formattedAddress: place.formatted_address || "",
    streetAddress: "",
    addressLine2: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    placeId: place.place_id || "",
  };
  let streetNumber = "";
  let route = "";

  for (const component of place.address_components) {
    const { types } = component;
    if (types.includes("street_number")) streetNumber = component.long_name;
    if (types.includes("route")) route = component.long_name;
    if (types.includes("subpremise")) components.addressLine2 = component.long_name;
    if (types.includes("locality")) components.city = component.long_name;
    if (types.includes("administrative_area_level_1")) components.state = component.short_name;
    if (types.includes("postal_code")) components.zipCode = component.long_name;
    if (types.includes("country")) components.country = component.long_name;
  }

  components.streetAddress = `${streetNumber} ${route}`.trim();
  if (!components.formattedAddress) {
    components.formattedAddress = [
      components.streetAddress,
      components.city,
      [components.state, components.zipCode].filter(Boolean).join(" "),
      components.country,
    ].filter(Boolean).join(", ");
  }

  return components;
}
