/**
 * MET Malaysia district registry - location_id -> district name + state.
 *
 * States come from MET's own district selector (met.gov.my), whose
 * <optgroup label=State> groups match the feed's location_id exactly.
 * Names come from the api.data.gov.my feed itself, so they always match
 * the rows we store (MET's English site names some districts differently,
 * e.g. Northeast Penang Island vs the feed's Timur Laut).
 *
 * Only district locations are listed. The feed also carries towns (Tn),
 * state rows (St), recreational sites (Rc) and Sarawak divisions (Dv) -
 * those are not districts and must never be presented as one.
 *
 * Generated data; do not hand-edit.
 */

/** [district name, state] keyed by MET location_id. */
export const MET_DISTRICTS: Record<string, [string, string]> = {
  Ds001: ["Langkawi", "Kedah"],
  Ds002: ["Perlis", "Perlis"],
  Ds003: ["Kubang Pasu", "Kedah"],
  Ds004: ["Kota Setar", "Kedah"],
  Ds005: ["Pokok Sena", "Kedah"],
  Ds006: ["Padang Terap", "Kedah"],
  Ds007: ["Yan", "Kedah"],
  Ds008: ["Pendang", "Kedah"],
  Ds009: ["Kuala Muda", "Kedah"],
  Ds010: ["Sik", "Kedah"],
  Ds011: ["Barat Daya", "Pulau Pinang"],
  Ds012: ["Timur Laut", "Pulau Pinang"],
  Ds013: ["Seberang Perai Utara", "Pulau Pinang"],
  Ds014: ["Seberang Perai Tengah", "Pulau Pinang"],
  Ds015: ["Baling", "Kedah"],
  Ds016: ["Kulim", "Kedah"],
  Ds017: ["Seberang Perai Selatan", "Pulau Pinang"],
  Ds018: ["Bandar Baharu", "Kedah"],
  Ds019: ["Kerian", "Perak"],
  Ds020: ["Larut, Matang Dan Selama", "Perak"],
  Ds021: ["Hulu Perak", "Perak"],
  Ds022: ["Tumpat", "Kelantan"],
  Ds023: ["Pasir Mas", "Kelantan"],
  Ds024: ["Kota Bharu", "Kelantan"],
  Ds025: ["Jeli", "Kelantan"],
  Ds026: ["Kuala Kangsar", "Perak"],
  Ds027: ["Tanah Merah", "Kelantan"],
  Ds028: ["Bachok", "Kelantan"],
  Ds029: ["Manjung", "Perak"],
  Ds030: ["Machang", "Kelantan"],
  Ds031: ["Pasir Puteh", "Kelantan"],
  Ds032: ["Kinta", "Perak"],
  Ds033: ["Perak Tengah", "Perak"],
  Ds034: ["Kuala Krai", "Kelantan"],
  Ds035: ["Kampar", "Perak"],
  Ds036: ["Bagan Datuk", "Perak"],
  Ds037: ["Besut", "Terengganu"],
  Ds038: ["Tanah Tinggi Cameron", "Pahang"],
  Ds039: ["Gua Musang", "Kelantan"],
  Ds040: ["Hilir Perak", "Perak"],
  Ds041: ["Batang Padang", "Perak"],
  Ds042: ["Setiu", "Terengganu"],
  Ds043: ["Sabak Bernam", "Selangor"],
  Ds044: ["Lipis", "Pahang"],
  Ds045: ["Muallim", "Perak"],
  Ds046: ["Kuala Nerus", "Terengganu"],
  Ds047: ["Hulu Terengganu", "Terengganu"],
  Ds048: ["Kuala Terengganu", "Terengganu"],
  Ds049: ["Kuala Selangor", "Selangor"],
  Ds050: ["Raub", "Pahang"],
  Ds051: ["Hulu Selangor", "Selangor"],
  Ds052: ["Marang", "Terengganu"],
  Ds053: ["Jerantut", "Pahang"],
  Ds054: ["Klang", "Selangor"],
  Ds055: ["Gombak", "Selangor"],
  Ds056: ["Dungun", "Terengganu"],
  Ds057: ["Petaling", "Selangor"],
  Ds058: ["Kuala Lumpur", "WP Kuala Lumpur"],
  Ds059: ["Bentong", "Pahang"],
  Ds060: ["Kuala Langat", "Selangor"],
  Ds061: ["Temerloh", "Pahang"],
  Ds062: ["Putrajaya", "WP Putrajaya"],
  Ds063: ["Hulu Langat", "Selangor"],
  Ds064: ["Sepang", "Selangor"],
  Ds065: ["Kemaman", "Terengganu"],
  Ds066: ["Maran", "Pahang"],
  Ds067: ["Jelebu", "Negeri Sembilan"],
  Ds068: ["Seremban", "Negeri Sembilan"],
  Ds069: ["Kuantan", "Pahang"],
  Ds070: ["Port Dickson", "Negeri Sembilan"],
  Ds071: ["Bera", "Pahang"],
  Ds072: ["Kuala Pilah", "Negeri Sembilan"],
  Ds073: ["Rembau", "Negeri Sembilan"],
  Ds074: ["Jempol", "Negeri Sembilan"],
  Ds075: ["Alor Gajah", "Melaka"],
  Ds076: ["Pekan", "Pahang"],
  Ds077: ["Tampin", "Negeri Sembilan"],
  Ds078: ["Melaka Tengah", "Melaka"],
  Ds079: ["Jasin", "Melaka"],
  Ds080: ["Rompin", "Pahang"],
  Ds081: ["Tangkak", "Johor"],
  Ds082: ["Segamat", "Johor"],
  Ds083: ["Muar", "Johor"],
  Ds084: ["Batu Pahat", "Johor"],
  Ds085: ["Kluang", "Johor"],
  Ds086: ["Mersing", "Johor"],
  Ds087: ["Pontian", "Johor"],
  Ds088: ["Kulai", "Johor"],
  Ds089: ["Kota Tinggi", "Johor"],
  Ds090: ["Johor Bahru", "Johor"],
  Ds092: ["Selama", "Perak"],
  Ds097: ["Pulau Tioman", "Pahang"],
  Ds501: ["Tebedu", "Sarawak"],
  Ds502: ["Bau", "Sarawak"],
  Ds503: ["Lundu", "Sarawak"],
  Ds504: ["Kuching", "Sarawak"],
  Ds505: ["Serian", "Sarawak"],
  Ds506: ["Samarahan", "Sarawak"],
  Ds507: ["Asajaya", "Sarawak"],
  Ds508: ["Simunjan", "Sarawak"],
  Ds509: ["Sri Aman", "Sarawak"],
  Ds510: ["Pusa", "Sarawak"],
  Ds511: ["Betong", "Sarawak"],
  Ds512: ["Saratok", "Sarawak"],
  Ds513: ["Kabong", "Sarawak"],
  Ds514: ["Lubok Antu", "Sarawak"],
  Ds515: ["Pakan", "Sarawak"],
  Ds516: ["Sarikei", "Sarawak"],
  Ds517: ["Tanjung Manis", "Sarawak"],
  Ds518: ["Julau", "Sarawak"],
  Ds519: ["Meradong", "Sarawak"],
  Ds520: ["Daro", "Sarawak"],
  Ds521: ["Sibu", "Sarawak"],
  Ds522: ["Kanowit", "Sarawak"],
  Ds523: ["Song", "Sarawak"],
  Ds524: ["Matu", "Sarawak"],
  Ds525: ["Dalat", "Sarawak"],
  Ds526: ["Selangau", "Sarawak"],
  Ds527: ["Mukah", "Sarawak"],
  Ds528: ["Kapit", "Sarawak"],
  Ds529: ["Bukit Mabong", "Sarawak"],
  Ds530: ["Tatau", "Sarawak"],
  Ds531: ["Bintulu", "Sarawak"],
  Ds532: ["Sebauh", "Sarawak"],
  Ds533: ["Belaga", "Sarawak"],
  Ds534: ["Subis", "Sarawak"],
  Ds535: ["Beluru", "Sarawak"],
  Ds536: ["Telang Usan", "Sarawak"],
  Ds537: ["Miri", "Sarawak"],
  Ds538: ["Marudi", "Sarawak"],
  Ds539: ["Limbang", "Sarawak"],
  Ds540: ["Lawas", "Sarawak"],
  Ds541: ["Sipitang", "Sabah"],
  Ds542: ["FP Labuan", "WP Labuan"],
  Ds543: ["Tenom", "Sabah"],
  Ds544: ["Kuala Penyu", "Sabah"],
  Ds545: ["Beaufort", "Sabah"],
  Ds546: ["Nabawan", "Sabah"],
  Ds547: ["Keningau", "Sabah"],
  Ds548: ["Papar", "Sabah"],
  Ds549: ["Putatan", "Sabah"],
  Ds550: ["Penampang", "Sabah"],
  Ds551: ["Tambunan", "Sabah"],
  Ds552: ["Tawau", "Sabah"],
  Ds553: ["Tongod", "Sabah"],
  Ds554: ["Kota Kinabalu", "Sabah"],
  Ds555: ["Tuaran", "Sabah"],
  Ds556: ["Ranau", "Sabah"],
  Ds557: ["Kunak", "Sabah"],
  Ds558: ["Kota Belud", "Sabah"],
  Ds559: ["Semporna", "Sabah"],
  Ds560: ["Telupid", "Sabah"],
  Ds561: ["Kota Marudu", "Sabah"],
  Ds562: ["Lahad Datu", "Sabah"],
  Ds563: ["Kinabatangan", "Sabah"],
  Ds564: ["Beluran", "Sabah"],
  Ds565: ["Sandakan", "Sabah"],
  Ds566: ["Pitas", "Sabah"],
  Ds567: ["Kudat", "Sabah"],
  Ds568: ["Membakut", "Sabah"],
  Ds570: ["Labuk & Sugut", "Sabah"],
  Ds571: ["Kalabakan", "Sabah"],
  Ds572: ["Sook", "Sabah"],
  Ds573: ["Sebuyau", "Sarawak"],
  Ds574: ["Gedong", "Sarawak"],
  Ds575: ["Pantu", "Sarawak"],
  Ds576: ["Lingga", "Sarawak"],
  Ds577: ["Siburan", "Sarawak"],
  Ds578: ["Labuan", "WP Labuan"],
  Ds579: ["Bario", "Sarawak"],
};

/** State for a MET location id, or null when it is not a district. */
export function districtState(id?: string | null): string | null {
  if (!id) return null;
  return MET_DISTRICTS[id]?.[1] ?? null;
}

/** True only for MET district locations. */
export function isDistrict(id?: string | null): boolean {
  return !!id && id in MET_DISTRICTS;
}

/** District name for a MET location id, or null. */
export function districtName(id?: string | null): string | null {
  if (!id) return null;
  return MET_DISTRICTS[id]?.[0] ?? null;
}

/** All districts for a state, sorted by name. */
export function districtsOf(state: string): { id: string; name: string }[] {
  return Object.entries(MET_DISTRICTS)
    .filter(([, [, st]]) => st === state)
    .map(([id, [name]]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
