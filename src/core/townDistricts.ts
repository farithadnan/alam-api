/**
 * Town -> MET district, for every locality we poll. GENERATED FILE - do not edit.
 * Regenerate with: npm run crosswalk   (source: data/town-districts.csv)
 *
 * Most rows are derived from name identity. The rest are stated in the CSV with
 * their provenance, because the weather feed does not record which district a town
 * belongs to and the two lists are named independently.
 *
 * 32 of 108 rows come from the CSV; the rest are identity.
 */

/** MET district for a locality slug. */
export const TOWN_DISTRICT: Record<string, string> = {
  "alor-gajah": "Alor Gajah", // Melaka · derived from name
  "alor-setar": "Kota Setar", // Kedah · csv: manual assertion, state via MET district selector
  "arau": "Perlis", // Perlis · csv: manual assertion, state via MET district selector
  "ayer-keroh": "Melaka Tengah", // Melaka · csv: manual assertion, state via MET district selector
  "bachok": "Bachok", // Kelantan · derived from name
  "balik-pulau": "Barat Daya", // Pulau Pinang · csv: manual assertion, state via MET district selector
  "baling": "Baling", // Kedah · derived from name
  "banting": "Kuala Langat", // Selangor · csv: manual assertion, state via MET district selector
  "batu-pahat": "Batu Pahat", // Johor · derived from name
  "bau": "Bau", // Sarawak · derived from name
  "beaufort": "Beaufort", // Sabah · derived from name
  "bentong": "Bentong", // Pahang · derived from name
  "bera": "Bera", // Pahang · derived from name
  "besut": "Besut", // Terengganu · derived from name
  "bintulu": "Bintulu", // Sarawak · derived from name
  "bukit-mertajam": "Seberang Perai Tengah", // Pulau Pinang · csv: manual assertion, state via MET district selector
  "butterworth": "Seberang Perai Utara", // Pulau Pinang · csv: manual assertion, state via MET district selector
  "cameron-highlands": "Tanah Tinggi Cameron", // Pahang · csv: manual assertion, state via MET district selector
  "dungun": "Dungun", // Terengganu · derived from name
  "george-town": "Timur Laut", // Pulau Pinang · csv: manual assertion, state via MET district selector
  "gerik": "Hulu Perak", // Perak · csv: manual assertion, state via MET district selector
  "gua-musang": "Gua Musang", // Kelantan · derived from name
  "ipoh": "Kinta", // Perak · csv: manual assertion, state via MET district selector
  "jasin": "Jasin", // Melaka · derived from name
  "jelebu": "Jelebu", // Negeri Sembilan · derived from name
  "jeli": "Jeli", // Kelantan · derived from name
  "jempol": "Jempol", // Negeri Sembilan · derived from name
  "johor-bahru": "Johor Bahru", // Johor · derived from name
  "kajang": "Hulu Langat", // Selangor · csv: manual assertion, state via MET district selector
  "kampar": "Kampar", // Perak · derived from name
  "kangar": "Perlis", // Perlis · csv: manual assertion, state via MET district selector
  "kapit": "Kapit", // Sarawak · derived from name
  "kemaman": "Kemaman", // Terengganu · derived from name
  "klang": "Klang", // Selangor · derived from name
  "kluang": "Kluang", // Johor · derived from name
  "kota-belud": "Kota Belud", // Sabah · derived from name
  "kota-bharu": "Kota Bharu", // Kelantan · derived from name
  "kota-kinabalu": "Kota Kinabalu", // Sabah · derived from name
  "kota-tinggi": "Kota Tinggi", // Johor · derived from name
  "kuala-berang": "Hulu Terengganu", // Terengganu · csv: manual assertion, state via MET district selector
  "kuala-kangsar": "Kuala Kangsar", // Perak · derived from name
  "kuala-krai": "Kuala Krai", // Kelantan · derived from name
  "kuala-kubu-bharu": "Hulu Selangor", // Selangor · csv: manual assertion, state via MET district selector
  "kuala-lumpur": "Kuala Lumpur", // WP Kuala Lumpur · derived from name
  "kuala-pilah": "Kuala Pilah", // Negeri Sembilan · derived from name
  "kuala-selangor": "Kuala Selangor", // Selangor · derived from name
  "kuala-terengganu": "Kuala Terengganu", // Terengganu · derived from name
  "kuantan": "Kuantan", // Pahang · derived from name
  "kuching": "Kuching", // Sarawak · derived from name
  "kudat": "Kudat", // Sabah · derived from name
  "kulai": "Kulai", // Johor · derived from name
  "kulim": "Kulim", // Kedah · derived from name
  "labuan": "Labuan", // WP Labuan · derived from name
  "lahad-datu": "Lahad Datu", // Sabah · derived from name
  "langkawi": "Langkawi", // Kedah · derived from name
  "lenggong": "Hulu Perak", // Perak · csv: manual assertion, state via MET district selector
  "lipis": "Lipis", // Pahang · derived from name
  "lundu": "Lundu", // Sarawak · derived from name
  "machang": "Machang", // Kelantan · derived from name
  "maran": "Maran", // Pahang · derived from name
  "masjid-tanah": "Alor Gajah", // Melaka · csv: manual assertion, state via MET district selector
  "melaka-city": "Melaka Tengah", // Melaka · csv: manual assertion, state via MET district selector
  "mersing": "Mersing", // Johor · derived from name
  "miri": "Miri", // Sarawak · derived from name
  "muar": "Muar", // Johor · derived from name
  "nibong-tebal": "Seberang Perai Selatan", // Pulau Pinang · csv: manual assertion, state via MET district selector
  "papar": "Papar", // Sabah · derived from name
  "parit-buntar": "Kerian", // Perak · csv: manual assertion, state via MET district selector
  "pasir-gudang": "Johor Bahru", // Johor · csv: manual assertion, state via MET district selector
  "pasir-mas": "Pasir Mas", // Kelantan · derived from name
  "pasir-puteh": "Pasir Puteh", // Kelantan · derived from name
  "pekan": "Pekan", // Pahang · derived from name
  "pendang": "Pendang", // Kedah · derived from name
  "pengerang": "Kota Tinggi", // Johor · csv: manual assertion, state via MET district selector
  "permaisuri": "Setiu", // Terengganu · csv: manual assertion, state via MET district selector
  "petaling-jaya": "Petaling", // Selangor · csv: manual assertion, state via MET district selector
  "pontian": "Pontian", // Johor · derived from name
  "port-dickson": "Port Dickson", // Negeri Sembilan · derived from name
  "putrajaya": "Putrajaya", // WP Putrajaya · derived from name
  "ranau": "Ranau", // Sabah · derived from name
  "rembau": "Rembau", // Negeri Sembilan · derived from name
  "rompin": "Rompin", // Pahang · derived from name
  "sabak-bernam": "Sabak Bernam", // Selangor · derived from name
  "sandakan": "Sandakan", // Sabah · derived from name
  "saratok": "Saratok", // Sarawak · derived from name
  "sarikei": "Sarikei", // Sarawak · derived from name
  "segamat": "Segamat", // Johor · derived from name
  "sepang": "Sepang", // Selangor · derived from name
  "seremban": "Seremban", // Negeri Sembilan · derived from name
  "shah-alam": "Petaling", // Selangor · csv: manual assertion, state via MET district selector
  "sibu": "Sibu", // Sarawak · derived from name
  "sik": "Sik", // Kedah · derived from name
  "sitiawan": "Manjung", // Perak · csv: manual assertion, state via MET district selector
  "sri-aman": "Sri Aman", // Sarawak · derived from name
  "subang-jaya": "Petaling", // Selangor · csv: manual assertion, state via MET district selector
  "sungai-petani": "Kuala Muda", // Kedah · csv: manual assertion, state via MET district selector
  "taiping": "Larut, Matang Dan Selama", // Perak · csv: manual assertion, state via MET district selector
  "tampin": "Tampin", // Negeri Sembilan · derived from name
  "tanah-merah": "Tanah Merah", // Kelantan · derived from name
  "tangkak": "Tangkak", // Johor · derived from name
  "tanjung-karang": "Kuala Selangor", // Selangor · csv: manual assertion, state via MET district selector
  "tanjung-malim": "Muallim", // Perak · csv: manual assertion, state via MET district selector
  "tawau": "Tawau", // Sabah · derived from name
  "teluk-intan": "Hilir Perak", // Perak · csv: manual assertion, state via MET district selector
  "temerloh": "Temerloh", // Pahang · derived from name
  "tenom": "Tenom", // Sabah · derived from name
  "tumpat": "Tumpat", // Kelantan · derived from name
  "yan": "Yan", // Kedah · derived from name
};

/** MET district name for a locality slug, or null when unknown. */
export function districtOf(townSlug?: string | null): string | null {
  if (!townSlug) return null;
  return TOWN_DISTRICT[townSlug] ?? null;
}
