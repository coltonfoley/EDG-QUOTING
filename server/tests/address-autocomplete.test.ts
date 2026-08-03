import { describe, expect, it } from "vitest";

import { addressComponentsFromPlace } from "../../client/src/lib/address-components";

describe("addressComponentsFromPlace", () => {
  it("preserves Google's formatted address and extracts structured fields", () => {
    expect(addressComponentsFromPlace({
      formatted_address: "100 Test Plaza, Granger, IN 46530, USA",
      place_id: "fictional-place-id",
      address_components: [
        { long_name: "100", short_name: "100", types: ["street_number"] },
        { long_name: "Test Plaza", short_name: "Test Plaza", types: ["route"] },
        { long_name: "Suite 200", short_name: "Suite 200", types: ["subpremise"] },
        { long_name: "Granger", short_name: "Granger", types: ["locality"] },
        { long_name: "Indiana", short_name: "IN", types: ["administrative_area_level_1"] },
        { long_name: "46530", short_name: "46530", types: ["postal_code"] },
        { long_name: "United States", short_name: "US", types: ["country"] },
      ],
    })).toEqual({
      formattedAddress: "100 Test Plaza, Granger, IN 46530, USA",
      streetAddress: "100 Test Plaza",
      addressLine2: "Suite 200",
      city: "Granger",
      state: "IN",
      zipCode: "46530",
      country: "United States",
      placeId: "fictional-place-id",
    });
  });

  it("builds a readable address when Google omits formatted_address", () => {
    expect(addressComponentsFromPlace({
      address_components: [
        { long_name: "100", short_name: "100", types: ["street_number"] },
        { long_name: "Test Plaza", short_name: "Test Plaza", types: ["route"] },
        { long_name: "Granger", short_name: "Granger", types: ["locality"] },
        { long_name: "Indiana", short_name: "IN", types: ["administrative_area_level_1"] },
        { long_name: "46530", short_name: "46530", types: ["postal_code"] },
      ],
    })?.formattedAddress).toBe("100 Test Plaza, Granger, IN 46530");
  });
});
