/** Nationwide localities for weather/forecast — every Malaysian state's capital + major towns.
 * Approximate lat/lon; used to poll Open-Meteo per locality. */
export interface Locality {
  slug: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
}

export const MALAYSIA_LOCALITIES: Locality[] = [
  // Johor
  { slug: "johor-bahru", name: "Johor Bahru", state: "Johor", lat: 1.49, lon: 103.74 },
  { slug: "batu-pahat", name: "Batu Pahat", state: "Johor", lat: 1.85, lon: 102.93 },
  { slug: "muar", name: "Muar", state: "Johor", lat: 2.04, lon: 102.57 },
  { slug: "kluang", name: "Kluang", state: "Johor", lat: 2.03, lon: 103.32 },
  { slug: "segamat", name: "Segamat", state: "Johor", lat: 2.51, lon: 102.81 },
  { slug: "pontian", name: "Pontian", state: "Johor", lat: 1.49, lon: 103.39 },
  { slug: "pasir-gudang", name: "Pasir Gudang", state: "Johor", lat: 1.46, lon: 103.88 },
  { slug: "kulai", name: "Kulai", state: "Johor", lat: 1.66, lon: 103.61 },
  { slug: "kota-tinggi", name: "Kota Tinggi", state: "Johor", lat: 1.74, lon: 103.90 },
  { slug: "tangkak", name: "Tangkak", state: "Johor", lat: 2.27, lon: 102.54 },
  { slug: "mersing", name: "Mersing", state: "Johor", lat: 2.43, lon: 103.84 },
  { slug: "pengerang", name: "Pengerang", state: "Johor", lat: 1.36, lon: 104.12 },
  // Kedah
  { slug: "alor-setar", name: "Alor Setar", state: "Kedah", lat: 6.12, lon: 100.37 },
  { slug: "sungai-petani", name: "Sungai Petani", state: "Kedah", lat: 5.65, lon: 100.49 },
  { slug: "kulim", name: "Kulim", state: "Kedah", lat: 5.37, lon: 100.56 },
  { slug: "langkawi", name: "Langkawi", state: "Kedah", lat: 6.32, lon: 99.85 },
  // Kelantan
  { slug: "kota-bharu", name: "Kota Bharu", state: "Kelantan", lat: 6.13, lon: 102.24 },
  { slug: "pasir-mas", name: "Pasir Mas", state: "Kelantan", lat: 6.05, lon: 102.14 },
  { slug: "tanah-merah", name: "Tanah Merah", state: "Kelantan", lat: 5.81, lon: 102.15 },
  { slug: "gua-musang", name: "Gua Musang", state: "Kelantan", lat: 4.88, lon: 101.97 },
  // Melaka
  { slug: "melaka-city", name: "Melaka City", state: "Melaka", lat: 2.19, lon: 102.25 },
  { slug: "ayer-keroh", name: "Ayer Keroh", state: "Melaka", lat: 2.27, lon: 102.28 },
  { slug: "jasin", name: "Jasin", state: "Melaka", lat: 2.31, lon: 102.43 },
  // Negeri Sembilan
  { slug: "seremban", name: "Seremban", state: "Negeri Sembilan", lat: 2.73, lon: 101.94 },
  { slug: "port-dickson", name: "Port Dickson", state: "Negeri Sembilan", lat: 2.52, lon: 101.79 },
  { slug: "kuala-pilah", name: "Kuala Pilah", state: "Negeri Sembilan", lat: 2.74, lon: 102.25 },
  { slug: "rembau", name: "Rembau", state: "Negeri Sembilan", lat: 2.58, lon: 102.05 },
  // Pahang
  { slug: "kuantan", name: "Kuantan", state: "Pahang", lat: 3.82, lon: 103.33 },
  { slug: "temerloh", name: "Temerloh", state: "Pahang", lat: 3.45, lon: 102.42 },
  { slug: "bentong", name: "Bentong", state: "Pahang", lat: 3.52, lon: 101.91 },
  { slug: "cameron-highlands", name: "Cameron Highlands", state: "Pahang", lat: 4.47, lon: 101.38 },
  { slug: "pekan", name: "Pekan", state: "Pahang", lat: 3.49, lon: 103.40 },
  // Pulau Pinang
  { slug: "george-town", name: "George Town", state: "Pulau Pinang", lat: 5.41, lon: 100.33 },
  { slug: "butterworth", name: "Butterworth", state: "Pulau Pinang", lat: 5.41, lon: 100.37 },
  { slug: "bukit-mertajam", name: "Bukit Mertajam", state: "Pulau Pinang", lat: 5.36, lon: 100.47 },
  { slug: "balik-pulau", name: "Balik Pulau", state: "Pulau Pinang", lat: 5.35, lon: 100.23 },
  // Perak
  { slug: "ipoh", name: "Ipoh", state: "Perak", lat: 4.60, lon: 101.07 },
  { slug: "taiping", name: "Taiping", state: "Perak", lat: 4.85, lon: 100.74 },
  { slug: "sitiawan", name: "Sitiawan", state: "Perak", lat: 4.22, lon: 100.70 },
  { slug: "teluk-intan", name: "Teluk Intan", state: "Perak", lat: 4.02, lon: 101.02 },
  { slug: "kuala-kangsar", name: "Kuala Kangsar", state: "Perak", lat: 4.77, lon: 100.94 },
  // Perlis
  { slug: "kangar", name: "Kangar", state: "Perlis", lat: 6.44, lon: 100.20 },
  { slug: "arau", name: "Arau", state: "Perlis", lat: 6.43, lon: 100.27 },
  // Selangor
  { slug: "shah-alam", name: "Shah Alam", state: "Selangor", lat: 3.07, lon: 101.52 },
  { slug: "petaling-jaya", name: "Petaling Jaya", state: "Selangor", lat: 3.11, lon: 101.61 },
  { slug: "klang", name: "Klang", state: "Selangor", lat: 3.04, lon: 101.45 },
  { slug: "subang-jaya", name: "Subang Jaya", state: "Selangor", lat: 3.06, lon: 101.59 },
  { slug: "kajang", name: "Kajang", state: "Selangor", lat: 2.99, lon: 101.79 },
  { slug: "sepang", name: "Sepang", state: "Selangor", lat: 2.79, lon: 101.74 },
  { slug: "sabak-bernam", name: "Sabak Bernam", state: "Selangor", lat: 3.77, lon: 100.99 },
  // Terengganu
  { slug: "kuala-terengganu", name: "Kuala Terengganu", state: "Terengganu", lat: 5.33, lon: 103.14 },
  { slug: "dungun", name: "Dungun", state: "Terengganu", lat: 4.77, lon: 103.43 },
  { slug: "kemaman", name: "Kemaman", state: "Terengganu", lat: 4.23, lon: 103.42 },
  { slug: "besut", name: "Besut", state: "Terengganu", lat: 5.83, lon: 102.56 },
  // Sabah
  { slug: "kota-kinabalu", name: "Kota Kinabalu", state: "Sabah", lat: 5.98, lon: 116.07 },
  { slug: "sandakan", name: "Sandakan", state: "Sabah", lat: 5.84, lon: 118.12 },
  { slug: "tawau", name: "Tawau", state: "Sabah", lat: 4.24, lon: 117.89 },
  { slug: "lahad-datu", name: "Lahad Datu", state: "Sabah", lat: 5.02, lon: 118.33 },
  { slug: "kudat", name: "Kudat", state: "Sabah", lat: 6.89, lon: 116.84 },
  { slug: "ranau", name: "Ranau", state: "Sabah", lat: 5.95, lon: 116.66 },
  // Sarawak
  { slug: "kuching", name: "Kuching", state: "Sarawak", lat: 1.55, lon: 110.36 },
  { slug: "sibu", name: "Sibu", state: "Sarawak", lat: 2.29, lon: 111.82 },
  { slug: "miri", name: "Miri", state: "Sarawak", lat: 4.40, lon: 113.99 },
  { slug: "bintulu", name: "Bintulu", state: "Sarawak", lat: 3.19, lon: 113.08 },
  { slug: "sri-aman", name: "Sri Aman", state: "Sarawak", lat: 1.24, lon: 111.46 },
  { slug: "sarikei", name: "Sarikei", state: "Sarawak", lat: 2.13, lon: 111.52 },
  // Federal territories
  { slug: "kuala-lumpur", name: "Kuala Lumpur", state: "WP Kuala Lumpur", lat: 3.14, lon: 101.69 },
  { slug: "labuan", name: "Labuan", state: "WP Labuan", lat: 5.28, lon: 115.24 },
  { slug: "putrajaya", name: "Putrajaya", state: "WP Putrajaya", lat: 2.93, lon: 101.71 },

  // --- additional district/town coverage across all states ---
  { slug: "baling", name: "Baling", state: "Kedah", lat: 5.68, lon: 100.92 },
  { slug: "pendang", name: "Pendang", state: "Kedah", lat: 5.99, lon: 100.48 },
  { slug: "yan", name: "Yan", state: "Kedah", lat: 5.80, lon: 100.38 },
  { slug: "sik", name: "Sik", state: "Kedah", lat: 5.82, lon: 100.74 },
  { slug: "tumpat", name: "Tumpat", state: "Kelantan", lat: 6.20, lon: 102.17 },
  { slug: "bachok", name: "Bachok", state: "Kelantan", lat: 6.06, lon: 102.40 },
  { slug: "pasir-puteh", name: "Pasir Puteh", state: "Kelantan", lat: 5.84, lon: 102.40 },
  { slug: "machang", name: "Machang", state: "Kelantan", lat: 5.76, lon: 102.22 },
  { slug: "kuala-krai", name: "Kuala Krai", state: "Kelantan", lat: 5.53, lon: 102.20 },
  { slug: "jeli", name: "Jeli", state: "Kelantan", lat: 5.70, lon: 101.84 },
  { slug: "alor-gajah", name: "Alor Gajah", state: "Melaka", lat: 2.39, lon: 102.21 },
  { slug: "masjid-tanah", name: "Masjid Tanah", state: "Melaka", lat: 2.35, lon: 102.10 },
  { slug: "jelebu", name: "Jelebu", state: "Negeri Sembilan", lat: 2.93, lon: 102.08 },
  { slug: "jempol", name: "Jempol", state: "Negeri Sembilan", lat: 2.90, lon: 102.42 },
  { slug: "tampin", name: "Tampin", state: "Negeri Sembilan", lat: 2.47, lon: 102.23 },
  { slug: "rompin", name: "Rompin", state: "Pahang", lat: 2.71, lon: 102.92 },
  { slug: "maran", name: "Maran", state: "Pahang", lat: 3.58, lon: 102.77 },
  { slug: "bera", name: "Bera", state: "Pahang", lat: 3.08, lon: 102.50 },
  { slug: "lipis", name: "Lipis", state: "Pahang", lat: 4.18, lon: 101.72 },
  { slug: "nibong-tebal", name: "Nibong Tebal", state: "Pulau Pinang", lat: 5.17, lon: 100.47 },
  { slug: "kampar", name: "Kampar", state: "Perak", lat: 4.30, lon: 101.15 },
  { slug: "tanjung-malim", name: "Tanjung Malim", state: "Perak", lat: 3.68, lon: 101.52 },
  { slug: "gerik", name: "Gerik", state: "Perak", lat: 5.43, lon: 101.13 },
  { slug: "parit-buntar", name: "Parit Buntar", state: "Perak", lat: 5.12, lon: 100.49 },
  { slug: "lenggong", name: "Lenggong", state: "Perak", lat: 5.10, lon: 101.06 },
  { slug: "kuala-selangor", name: "Kuala Selangor", state: "Selangor", lat: 3.35, lon: 101.25 },
  { slug: "banting", name: "Banting", state: "Selangor", lat: 2.81, lon: 101.50 },
  { slug: "kuala-kubu-bharu", name: "Kuala Kubu Bharu", state: "Selangor", lat: 3.56, lon: 101.66 },
  { slug: "tanjung-karang", name: "Tanjung Karang", state: "Selangor", lat: 3.43, lon: 101.18 },
  { slug: "kuala-berang", name: "Kuala Berang", state: "Terengganu", lat: 5.07, lon: 103.00 },
  { slug: "permaisuri", name: "Permaisuri", state: "Terengganu", lat: 5.52, lon: 102.75 },
  { slug: "papar", name: "Papar", state: "Sabah", lat: 5.73, lon: 115.93 },
  { slug: "beaufort", name: "Beaufort", state: "Sabah", lat: 5.35, lon: 115.74 },
  { slug: "kota-belud", name: "Kota Belud", state: "Sabah", lat: 6.35, lon: 116.43 },
  { slug: "tenom", name: "Tenom", state: "Sabah", lat: 5.13, lon: 115.94 },
  { slug: "kapit", name: "Kapit", state: "Sarawak", lat: 2.02, lon: 112.94 },
  { slug: "bau", name: "Bau", state: "Sarawak", lat: 1.42, lon: 110.15 },
  { slug: "saratok", name: "Saratok", state: "Sarawak", lat: 1.75, lon: 111.34 },
  { slug: "lundu", name: "Lundu", state: "Sarawak", lat: 1.67, lon: 109.85 },
];
