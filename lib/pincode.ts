// Indian PIN codes: the post offices of a PIN give the areas to choose from, plus the city (district)
// and state. India Post's public PIN API needs no key. Only the PIN code is sent.
export type PinInfo = { pincode: string; city: string; state: string; areas: string[] };
type PostOffice = { Name: string; District: string; State: string };

export async function lookupPin(pin: string): Promise<PinInfo | null> {
  const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
  const [answer] = (await res.json()) as [{ Status: string; PostOffice: PostOffice[] | null }];
  const offices = answer?.Status === "Success" ? answer.PostOffice ?? [] : [];
  if (!offices.length) return null;
  return {
    pincode: pin,
    city: offices[0].District,
    state: offices[0].State,
    areas: [...new Set(offices.map((o) => o.Name))].sort(),
  };
}

// The map point for the 5 km collector search, from OpenStreetMap (Nominatim, a few lookups at most per
// sign-up). Tries the area itself, then the PIN code, then the city. Only the place names are sent.
export async function locate(area: string, city: string, state: string, pin: string) {
  const tries = [
    `q=${encodeURIComponent(`${area}, ${city}, ${state}, India`)}`,
    `postalcode=${pin}&countrycodes=in`,
    `q=${encodeURIComponent(`${city}, ${state}, India`)}`,
  ];
  for (const query of tries) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&${query}`);
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    if (hit) return { lat: Number(hit.lat), lng: Number(hit.lon) };
  }
  return null;
}
