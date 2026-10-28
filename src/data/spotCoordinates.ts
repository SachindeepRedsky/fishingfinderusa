// Approximate coordinates for all fishing spots
// Based on city/state locations from the address field

export interface SpotCoordinate {
  lat: number;
  lng: number;
}

export const spotCoordinates: Record<number, SpotCoordinate> = {
  // ALABAMA
  1: { lat: 34.3501, lng: -86.2939 }, // Lake Guntersville
  2: { lat: 34.6059, lng: -87.0000 }, // Wheeler Lake
  3: { lat: 30.6954, lng: -88.0399 }, // Mobile Bay

  // ALASKA
  4: { lat: 60.4862, lng: -150.1089 }, // Kenai River
  5: { lat: 58.8000, lng: -158.5000 }, // Bristol Bay
  6: { lat: 60.1042, lng: -149.4422 }, // Resurrection Bay

  // ARIZONA
  7: { lat: 37.0700, lng: -111.2500 }, // Lake Powell
  8: { lat: 36.8700, lng: -111.5900 }, // Lees Ferry

  // ARKANSAS
  9: { lat: 36.3800, lng: -92.5800 }, // White River
  10: { lat: 34.5000, lng: -93.0500 }, // Lake Ouachita

  // CALIFORNIA
  11: { lat: 39.0968, lng: -120.0324 }, // Lake Tahoe
  12: { lat: 32.7157, lng: -117.1611 }, // San Diego Bay
  13: { lat: 40.5865, lng: -122.3917 }, // Sacramento River

  // COLORADO
  14: { lat: 39.2300, lng: -105.2100 }, // South Platte River
  15: { lat: 38.4500, lng: -107.3300 }, // Blue Mesa Reservoir

  // CONNECTICUT
  16: { lat: 41.4000, lng: -73.4700 }, // Candlewood Lake
  17: { lat: 41.8400, lng: -73.3600 }, // Housatonic River

  // DELAWARE
  18: { lat: 38.7745, lng: -75.1393 }, // Delaware Bay
  19: { lat: 39.5600, lng: -75.7200 }, // Lums Pond

  // FLORIDA
  20: { lat: 26.9687, lng: -80.8295 }, // Lake Okeechobee
  21: { lat: 24.5551, lng: -81.7800 }, // Florida Keys
  22: { lat: 29.6500, lng: -81.6500 }, // St. Johns River

  // GEORGIA
  23: { lat: 34.1600, lng: -84.0700 }, // Lake Lanier
  24: { lat: 31.6100, lng: -81.8800 }, // Altamaha River

  // HAWAII
  25: { lat: 19.6400, lng: -155.9900 }, // Kona Coast
  26: { lat: 21.5000, lng: -158.0200 }, // Wahiawa Reservoir

  // IDAHO
  27: { lat: 42.5600, lng: -114.4600 }, // Snake River
  28: { lat: 47.6800, lng: -116.7800 }, // Lake Coeur d'Alene

  // ILLINOIS
  29: { lat: 41.8781, lng: -87.6298 }, // Lake Michigan - Chicago
  30: { lat: 38.0000, lng: -88.9300 }, // Rend Lake

  // INDIANA
  31: { lat: 38.4100, lng: -86.6900 }, // Patoka Lake
  32: { lat: 40.4167, lng: -86.8753 }, // Wabash River

  // IOWA
  33: { lat: 43.4200, lng: -95.1000 }, // Spirit Lake
  34: { lat: 43.3600, lng: -91.2200 }, // Mississippi River Pool 9

  // KANSAS
  35: { lat: 39.0700, lng: -96.9000 }, // Milford Reservoir
  36: { lat: 38.4000, lng: -96.1800 }, // Flint Hills Pay Lake

  // KENTUCKY
  37: { lat: 36.9400, lng: -88.2800 }, // Kentucky Lake
  38: { lat: 36.6100, lng: -85.4500 }, // Dale Hollow Lake

  // LOUISIANA
  39: { lat: 29.2700, lng: -89.3500 }, // Venice
  40: { lat: 31.5600, lng: -93.5600 }, // Toledo Bend

  // MAINE
  41: { lat: 45.5400, lng: -69.6600 }, // Moosehead Lake
  42: { lat: 44.3100, lng: -69.7800 }, // Kennebec River

  // MARYLAND
  43: { lat: 38.9000, lng: -76.3500 }, // Chesapeake Bay
  44: { lat: 39.5100, lng: -79.3500 }, // Deep Creek Lake

  // MASSACHUSETTS
  45: { lat: 42.0500, lng: -70.1800 }, // Cape Cod Bay
  46: { lat: 42.3200, lng: -72.3300 }, // Quabbin Reservoir

  // MICHIGAN
  47: { lat: 43.6000, lng: -86.3500 }, // Lake Michigan
  48: { lat: 44.6600, lng: -84.7100 }, // Au Sable River
  49: { lat: 42.5800, lng: -82.7600 }, // Lake St. Clair

  // MINNESOTA
  50: { lat: 46.2000, lng: -93.6000 }, // Mille Lacs Lake
  51: { lat: 47.9000, lng: -91.8300 }, // Boundary Waters

  // MISSISSIPPI
  52: { lat: 32.3500, lng: -89.9800 }, // Ross Barnett Reservoir
  53: { lat: 30.3900, lng: -88.8900 }, // Mississippi Gulf Coast

  // MISSOURI
  54: { lat: 38.1300, lng: -92.6600 }, // Lake of the Ozarks
  55: { lat: 36.6300, lng: -93.3200 }, // Table Rock Lake

  // MONTANA
  56: { lat: 45.6600, lng: -110.5600 }, // Yellowstone River
  57: { lat: 47.6100, lng: -106.6400 }, // Fort Peck Reservoir

  // NEBRASKA
  58: { lat: 41.2200, lng: -101.6600 }, // Lake McConaughy
  59: { lat: 41.8300, lng: -99.1500 }, // Calamus Reservoir

  // NEVADA
  60: { lat: 36.1500, lng: -114.7400 }, // Lake Mead
  61: { lat: 40.0000, lng: -119.5500 }, // Pyramid Lake

  // NEW HAMPSHIRE
  62: { lat: 43.5300, lng: -71.4700 }, // Lake Winnipesaukee
  63: { lat: 45.0000, lng: -71.3500 }, // Connecticut River NH

  // NEW JERSEY
  64: { lat: 39.7600, lng: -74.1100 }, // Barnegat Bay
  65: { lat: 40.6400, lng: -74.8400 }, // Round Valley Reservoir

  // NEW MEXICO
  66: { lat: 33.1500, lng: -107.2500 }, // Elephant Butte Lake
  67: { lat: 36.8100, lng: -107.6200 }, // San Juan River

  // NEW YORK
  68: { lat: 43.5600, lng: -76.1700 }, // Salmon River
  69: { lat: 41.0700, lng: -71.8600 }, // Montauk Point
  70: { lat: 42.8700, lng: -76.9800 }, // Finger Lakes

  // NORTH CAROLINA
  71: { lat: 35.9600, lng: -75.6200 }, // Outer Banks
  72: { lat: 35.5900, lng: -80.9500 }, // Lake Norman

  // NORTH DAKOTA
  73: { lat: 47.6500, lng: -102.5000 }, // Lake Sakakawea
  74: { lat: 48.1100, lng: -98.8600 }, // Devils Lake

  // OHIO
  75: { lat: 41.5000, lng: -81.7000 }, // Lake Erie
  76: { lat: 39.1000, lng: -84.5100 }, // Ohio River

  // OKLAHOMA
  77: { lat: 36.5900, lng: -94.7900 }, // Grand Lake
  78: { lat: 34.1700, lng: -94.7200 }, // Broken Bow Lake

  // OREGON
  79: { lat: 45.1700, lng: -121.1800 }, // Deschutes River
  80: { lat: 45.5600, lng: -123.9100 }, // Tillamook Bay

  // PENNSYLVANIA
  81: { lat: 42.1200, lng: -80.0900 }, // Lake Erie PA
  82: { lat: 39.9526, lng: -75.1652 }, // Delaware River

  // RHODE ISLAND
  83: { lat: 41.1700, lng: -71.5800 }, // Block Island
  84: { lat: 41.7000, lng: -71.4200 }, // Narragansett Bay

  // SOUTH CAROLINA
  85: { lat: 34.0700, lng: -81.2100 }, // Lake Murray
  86: { lat: 32.7800, lng: -79.9300 }, // Charleston Harbor

  // SOUTH DAKOTA
  87: { lat: 44.3700, lng: -100.3900 }, // Lake Oahe
  88: { lat: 43.8100, lng: -99.3200 }, // Lake Sharpe

  // TENNESSEE
  89: { lat: 36.2200, lng: -84.0800 }, // Norris Lake
  90: { lat: 36.3700, lng: -89.4200 }, // Reelfoot Lake

  // TEXAS
  91: { lat: 32.8800, lng: -95.7300 }, // Lake Fork
  92: { lat: 27.8300, lng: -97.0600 }, // Gulf of Mexico TX
  93: { lat: 26.9100, lng: -99.1400 }, // Falcon Lake

  // UTAH
  94: { lat: 37.5200, lng: -110.4100 }, // Lake Powell UT
  95: { lat: 40.9100, lng: -109.4200 }, // Green River

  // VERMONT
  96: { lat: 44.4759, lng: -73.2121 }, // Lake Champlain
  97: { lat: 43.1600, lng: -73.0700 }, // Battenkill River

  // VIRGINIA
  98: { lat: 37.5407, lng: -77.4360 }, // James River
  99: { lat: 37.0400, lng: -79.5200 }, // Smith Mountain Lake

  // WASHINGTON
  100: { lat: 47.6062, lng: -122.3321 }, // Puget Sound
  101: { lat: 46.1900, lng: -123.8300 }, // Columbia River

  // WEST VIRGINIA
  102: { lat: 38.0600, lng: -81.0800 }, // New River
  103: { lat: 38.2300, lng: -80.8500 }, // Summersville Lake

  // WISCONSIN
  104: { lat: 44.0200, lng: -88.5400 }, // Lake Winnebago
  105: { lat: 46.0100, lng: -91.3400 }, // Chippewa Flowage

  // WYOMING
  106: { lat: 42.8700, lng: -106.3100 }, // North Platte River
  107: { lat: 44.5600, lng: -110.3500 }, // Yellowstone Lake

  // Additional spots
  108: { lat: 33.5200, lng: -80.4200 }, // Santee Cooper
  109: { lat: 41.1500, lng: -109.5500 }, // Flaming Gorge
  110: { lat: 30.4400, lng: -85.0500 }, // Apalachicola River
  111: { lat: 48.6600, lng: -93.3600 }, // Rainy Lake
  112: { lat: 34.8800, lng: -83.3800 }, // Chattooga River
  113: { lat: 33.9800, lng: -96.7800 }, // Lake Texoma
  114: { lat: 41.9600, lng: -74.8400 }, // Beaverkill River
  115: { lat: 43.6500, lng: -83.8900 }, // Saginaw Bay

  // Dams
  116: { lat: 36.0160, lng: -114.7377 }, // Hoover Dam
  117: { lat: 45.6400, lng: -121.9400 }, // Bonneville Dam
  118: { lat: 36.9900, lng: -88.2700 }, // Kentucky Dam
  119: { lat: 36.5900, lng: -93.3100 }, // Table Rock Dam
  120: { lat: 36.9400, lng: -111.4800 }, // Glen Canyon Dam

  // Private
  121: { lat: 34.2400, lng: -116.9100 }, // Big Bear Lake
  122: { lat: 39.6400, lng: -106.3700 }, // Private Trout Stream CO
  123: { lat: 33.7490, lng: -84.3880 }, // Georgia Bass Club

  // Pay Lakes
  124: { lat: 36.1627, lng: -86.7816 }, // Trophy Trout Pay Lake TN
  125: { lat: 39.7684, lng: -86.1581 }, // Family Fun Pay Lake IN

  // Urban spots
  126: { lat: 40.7968, lng: -73.9520 }, // Central Park Harlem Meer
  127: { lat: 40.6602, lng: -73.9690 }, // Prospect Park Lake
  128: { lat: 41.9214, lng: -87.6352 }, // Lincoln Park Lagoon
  129: { lat: 29.7220, lng: -95.3900 }, // Hermann Park
  130: { lat: 32.8200, lng: -96.7200 }, // White Rock Lake
  131: { lat: 30.2500, lng: -97.7500 }, // Lady Bird Lake
  132: { lat: 29.8700, lng: -95.1500 }, // Sheldon Lake
  133: { lat: 33.4300, lng: -111.9300 }, // Tempe Town Lake
  134: { lat: 34.4700, lng: -114.3200 }, // Lake Havasu
  135: { lat: 37.8000, lng: -122.2500 }, // Lake Merritt
  136: { lat: 32.8400, lng: -116.9700 }, // Santee Lakes
  137: { lat: 38.8800, lng: -76.9700 }, // Anacostia River
  138: { lat: 39.7500, lng: -105.0300 }, // Sloan's Lake
  139: { lat: 36.1100, lng: -86.6200 }, // Percy Priest Lake
  140: { lat: 45.4700, lng: -122.6500 }, // Westmoreland Park
  141: { lat: 44.9100, lng: -93.2400 }, // Lake Nokomis

  // Kid-friendly
  142: { lat: 39.5300, lng: -105.0700 }, // Chatfield State Park
  143: { lat: 38.7600, lng: -77.2900 }, // Burke Lake
  144: { lat: 30.4600, lng: -84.2800 }, // Lake Ella
  145: { lat: 34.2100, lng: -77.9400 }, // Greenfield Lake
  146: { lat: 39.5700, lng: -84.7500 }, // Hueston Woods
  147: { lat: 43.5600, lng: -89.8000 }, // Mirror Lake
  148: { lat: 38.7900, lng: -77.2300 }, // Lake Accotink
  149: { lat: 33.5700, lng: -111.8500 }, // Scottsdale Ranch Park

  // Underrepresented states
  150: { lat: 41.9600, lng: -73.4500 }, // East Twin Lake CT
  151: { lat: 39.0200, lng: -75.5400 }, // Killens Pond DE
  152: { lat: 21.2800, lng: -157.8300 }, // Ala Wai Canal HI
  153: { lat: 44.6100, lng: -111.3800 }, // Henry's Lake ID
  154: { lat: 43.1400, lng: -93.3800 }, // Clear Lake IA
  155: { lat: 37.8200, lng: -96.8600 }, // El Dorado Reservoir KS
  156: { lat: 43.8000, lng: -70.5500 }, // Sebago Lake ME
  157: { lat: 39.4200, lng: -76.9200 }, // Liberty Reservoir MD
  158: { lat: 42.3800, lng: -71.7200 }, // Wachusett Reservoir MA
  159: { lat: 47.8800, lng: -114.1500 }, // Flathead Lake MT
  160: { lat: 42.0500, lng: -100.1600 }, // Merritt Reservoir NE
  161: { lat: 43.7600, lng: -71.6100 }, // Squam Lake NH
  162: { lat: 40.6600, lng: -74.8600 }, // Spruce Run NJ
  163: { lat: 36.6700, lng: -106.7300 }, // Heron Lake NM
  164: { lat: 47.5100, lng: -101.4200 }, // Garrison Dam ND
  165: { lat: 41.4200, lng: -71.6800 }, // Worden Pond RI
  166: { lat: 43.5500, lng: -96.7300 }, // Big Sioux River SD
  167: { lat: 44.9400, lng: -72.2000 }, // Lake Memphremagog VT
  168: { lat: 38.8800, lng: -80.4600 }, // Stonewall Jackson Lake WV
  169: { lat: 43.6500, lng: -108.2100 }, // Bighorn River WY

  // Additional popular spots
  170: { lat: 36.3500, lng: -93.8500 }, // Beaver Lake AR
  171: { lat: 36.8900, lng: -85.0300 }, // Lake Cumberland KY
  172: { lat: 31.0600, lng: -94.1000 }, // Sam Rayburn TX
  173: { lat: 35.7200, lng: -79.0600 }, // Jordan Lake NC
  174: { lat: 35.6100, lng: -95.0500 }, // Tenkiller Ferry Lake OK
  175: { lat: 34.1600, lng: -84.6900 }, // Lake Allatoona GA
  176: { lat: 33.2000, lng: -86.5500 }, // Lay Lake AL
  177: { lat: 25.1400, lng: -80.9100 }, // Everglades FL
  178: { lat: 43.9000, lng: -85.8500 }, // Pere Marquette River MI
  179: { lat: 40.4100, lng: -78.0100 }, // Raystown Lake PA
  180: { lat: 32.7800, lng: -92.1200 }, // Lake D'Arbonne LA
  181: { lat: 33.7700, lng: -89.8100 }, // Grenada Lake MS
  182: { lat: 37.6900, lng: -93.7900 }, // Stockton Lake MO
  183: { lat: 39.1100, lng: -86.5200 }, // Monroe Lake IN
  184: { lat: 40.8200, lng: -92.8700 }, // Rathbun Lake IA
};

// Calculate distance between two points using Haversine formula
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Format distance for display
export function formatDistance(miles: number): string {
  if (miles < 1) return '< 1 mi';
  if (miles < 100) return `${Math.round(miles)} mi`;
  return `${Math.round(miles).toLocaleString()} mi`;
}
