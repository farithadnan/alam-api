/**
 * Town -> MET district, for every locality we poll.
 *
 * Most towns are their own district; the rest are cities inside a differently
 * named district (Alor Setar is in Kota Setar, George Town in Timur Laut).
 * Generated from the locality list + district registry, with the city mappings
 * stated explicitly. The coverage test fails if a locality is ever left
 * unmapped, so the app cannot silently lose a town's official forecast.
 */

/** MET district for a locality slug. */
export const TOWN_DISTRICT: Record<string, string> = {
  "alor-gajah": "Alor Gajah", // Melaka
  "alor-setar": "Kota Setar", // Kedah
  "arau": "Perlis", // Perlis
  "ayer-keroh": "Melaka Tengah", // Melaka
  "bachok": "Bachok", // Kelantan
  "balik-pulau": "Barat Daya", // Pulau Pinang
  "baling": "Baling", // Kedah
  "banting": "Kuala Langat", // Selangor
  "batu-pahat": "Batu Pahat", // Johor
  "bau": "Bau", // Sarawak
  "beaufort": "Beaufort", // Sabah
  "bentong": "Bentong", // Pahang
  "bera": "Bera", // Pahang
  "besut": "Besut", // Terengganu
  "bintulu": "Bintulu", // Sarawak
  "bukit-mertajam": "Seberang Perai Tengah", // Pulau Pinang
  "butterworth": "Seberang Perai Utara", // Pulau Pinang
  "cameron-highlands": "Tanah Tinggi Cameron", // Pahang
  "dungun": "Dungun", // Terengganu
  "george-town": "Timur Laut", // Pulau Pinang
  "gerik": "Hulu Perak", // Perak
  "gua-musang": "Gua Musang", // Kelantan
  "ipoh": "Kinta", // Perak
  "jasin": "Jasin", // Melaka
  "jelebu": "Jelebu", // Negeri Sembilan
  "jeli": "Jeli", // Kelantan
  "jempol": "Jempol", // Negeri Sembilan
  "johor-bahru": "Johor Bahru", // Johor
  "kajang": "Hulu Langat", // Selangor
  "kampar": "Kampar", // Perak
  "kangar": "Perlis", // Perlis
  "kapit": "Kapit", // Sarawak
  "kemaman": "Kemaman", // Terengganu
  "klang": "Klang", // Selangor
  "kluang": "Kluang", // Johor
  "kota-belud": "Kota Belud", // Sabah
  "kota-bharu": "Kota Bharu", // Kelantan
  "kota-kinabalu": "Kota Kinabalu", // Sabah
  "kota-tinggi": "Kota Tinggi", // Johor
  "kuala-berang": "Hulu Terengganu", // Terengganu
  "kuala-kangsar": "Kuala Kangsar", // Perak
  "kuala-krai": "Kuala Krai", // Kelantan
  "kuala-kubu-bharu": "Hulu Selangor", // Selangor
  "kuala-lumpur": "Kuala Lumpur", // WP Kuala Lumpur
  "kuala-pilah": "Kuala Pilah", // Negeri Sembilan
  "kuala-selangor": "Kuala Selangor", // Selangor
  "kuala-terengganu": "Kuala Terengganu", // Terengganu
  "kuantan": "Kuantan", // Pahang
  "kuching": "Kuching", // Sarawak
  "kudat": "Kudat", // Sabah
  "kulai": "Kulai", // Johor
  "kulim": "Kulim", // Kedah
  "labuan": "Labuan", // WP Labuan
  "lahad-datu": "Lahad Datu", // Sabah
  "langkawi": "Langkawi", // Kedah
  "lenggong": "Hulu Perak", // Perak
  "lipis": "Lipis", // Pahang
  "lundu": "Lundu", // Sarawak
  "machang": "Machang", // Kelantan
  "maran": "Maran", // Pahang
  "masjid-tanah": "Alor Gajah", // Melaka
  "melaka-city": "Melaka Tengah", // Melaka
  "mersing": "Mersing", // Johor
  "miri": "Miri", // Sarawak
  "muar": "Muar", // Johor
  "nibong-tebal": "Seberang Perai Selatan", // Pulau Pinang
  "papar": "Papar", // Sabah
  "parit-buntar": "Kerian", // Perak
  "pasir-gudang": "Johor Bahru", // Johor
  "pasir-mas": "Pasir Mas", // Kelantan
  "pasir-puteh": "Pasir Puteh", // Kelantan
  "pekan": "Pekan", // Pahang
  "pendang": "Pendang", // Kedah
  "pengerang": "Kota Tinggi", // Johor
  "permaisuri": "Setiu", // Terengganu
  "petaling-jaya": "Petaling", // Selangor
  "pontian": "Pontian", // Johor
  "port-dickson": "Port Dickson", // Negeri Sembilan
  "putrajaya": "Putrajaya", // WP Putrajaya
  "ranau": "Ranau", // Sabah
  "rembau": "Rembau", // Negeri Sembilan
  "rompin": "Rompin", // Pahang
  "sabak-bernam": "Sabak Bernam", // Selangor
  "sandakan": "Sandakan", // Sabah
  "saratok": "Saratok", // Sarawak
  "sarikei": "Sarikei", // Sarawak
  "segamat": "Segamat", // Johor
  "sepang": "Sepang", // Selangor
  "seremban": "Seremban", // Negeri Sembilan
  "shah-alam": "Petaling", // Selangor
  "sibu": "Sibu", // Sarawak
  "sik": "Sik", // Kedah
  "sitiawan": "Manjung", // Perak
  "sri-aman": "Sri Aman", // Sarawak
  "subang-jaya": "Petaling", // Selangor
  "sungai-petani": "Kuala Muda", // Kedah
  "taiping": "Larut, Matang Dan Selama", // Perak
  "tampin": "Tampin", // Negeri Sembilan
  "tanah-merah": "Tanah Merah", // Kelantan
  "tangkak": "Tangkak", // Johor
  "tanjung-karang": "Kuala Selangor", // Selangor
  "tanjung-malim": "Muallim", // Perak
  "tawau": "Tawau", // Sabah
  "teluk-intan": "Hilir Perak", // Perak
  "temerloh": "Temerloh", // Pahang
  "tenom": "Tenom", // Sabah
  "tumpat": "Tumpat", // Kelantan
  "yan": "Yan", // Kedah
};

/** MET district name for a locality slug, or null when unknown. */
export function districtOf(townSlug?: string | null): string | null {
  if (!townSlug) return null;
  return TOWN_DISTRICT[townSlug] ?? null;
}
