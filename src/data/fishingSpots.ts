import { supabase } from '@/lib/supabase';
import type { FishSpecies } from '@/data/fishSpecies';

export interface SubscriptionPeriod {
  status: string;
  current_period_end: string | null;
}

export interface FishingSpot {
  id: number;
  name: string;
  type: 'lake' | 'river' | 'ocean' | 'private' | 'pay-lake' | 'dam';
  state: string;
  address: string;
  fish: string[];
  cost: string;
  description: string;
  bestSeason: string;
  fishingTips: string[];
  latitude?: number | null;
  longitude?: number | null;
}

export const fishingSpots: FishingSpot[] = [
  // ALABAMA
  { id: 1, name: "Lake Guntersville", type: "lake", state: "Alabama", address: "Lake Guntersville, Guntersville, AL 35976", fish: ["Largemouth Bass", "Crappie", "Striped Bass", "Catfish"], cost: "Free (License Required)", description: "Consistently ranked as one of the best bass lakes in America with massive grass beds.", bestSeason: "Spring & Fall", fishingTips: ["Fish the grass edges with swimbaits in spring", "Target bridge pilings for crappie in winter", "Use topwater frogs over matted vegetation in summer"] },
  { id: 2, name: "Wheeler Lake", type: "lake", state: "Alabama", address: "Wheeler Lake, Decatur, AL 35601", fish: ["Smallmouth Bass", "Largemouth Bass", "Crappie", "Catfish", "Striped Bass"], cost: "Free (License Required)", description: "Tennessee River impoundment known for excellent smallmouth bass and crappie fishing.", bestSeason: "Spring", fishingTips: ["Target rocky points for smallmouth in spring", "Fish brush piles for crappie with minnows", "Night fish for catfish near the dam"] },
  { id: 3, name: "Mobile Bay", type: "ocean", state: "Alabama", address: "Mobile Bay, Mobile, AL 36602", fish: ["Red Drum", "Speckled Trout", "Flounder", "Sheepshead"], cost: "Free (License Required)", description: "Massive estuary system offering year-round inshore saltwater fishing.", bestSeason: "Fall", fishingTips: ["Wade fish the grass flats for speckled trout at dawn", "Use live shrimp under a popping cork", "Target oyster reefs for sheepshead with fiddler crabs"] },

  // ALASKA
  { id: 4, name: "Kenai River", type: "river", state: "Alaska", address: "Kenai River, Soldotna, AK 99669", fish: ["King Salmon", "Sockeye Salmon", "Rainbow Trout", "Dolly Varden"], cost: "Free (License Required)", description: "World-famous for trophy king salmon fishing with runs exceeding 50 lbs.", bestSeason: "Summer", fishingTips: ["Book a drift boat guide for king salmon in July", "Use bead patterns for rainbow trout in fall", "Combat fish for sockeye in the Russian River confluence"] },
  { id: 5, name: "Bristol Bay", type: "ocean", state: "Alaska", address: "Bristol Bay, Dillingham, AK 99576", fish: ["Sockeye Salmon", "King Salmon", "Rainbow Trout", "Arctic Char", "Northern Pike"], cost: "Fly-in Lodge ($3,000-8,000/week)", description: "The world's greatest wild salmon fishery with pristine wilderness rivers.", bestSeason: "Summer", fishingTips: ["Plan trips for late June for king salmon", "July is prime for sockeye runs", "September offers trophy rainbow trout on mouse patterns"] },
  { id: 6, name: "Resurrection Bay", type: "ocean", state: "Alaska", address: "Resurrection Bay, Seward, AK 99664", fish: ["Halibut", "Silver Salmon", "Lingcod", "Rockfish"], cost: "Charter ($250-400/person)", description: "Deep-water fishing paradise near Seward with stunning glacial scenery.", bestSeason: "Summer", fishingTips: ["Book halibut charters May-August", "Use herring for silver salmon in August", "Fish deep structure for lingcod with large jigs"] },

  // ARIZONA
  { id: 7, name: "Lake Powell", type: "lake", state: "Arizona", address: "Lake Powell, Page, AZ 86040", fish: ["Striped Bass", "Largemouth Bass", "Smallmouth Bass", "Walleye", "Crappie"], cost: "Free (License Required)", description: "Stunning red-rock reservoir with 2,000 miles of shoreline and excellent striper fishing.", bestSeason: "Spring & Fall", fishingTips: ["Chase boiling stripers with topwater lures in fall", "Fish canyon walls for smallmouth with drop shots", "Troll deep for walleye near the dam"] },
  { id: 8, name: "Colorado River - Lees Ferry", type: "river", state: "Arizona", address: "Lees Ferry, Marble Canyon, AZ 86036", fish: ["Rainbow Trout", "Brown Trout"], cost: "Free (License Required)", description: "Crystal-clear tailwater below Glen Canyon Dam with trophy trout in a desert canyon.", bestSeason: "Year-round", fishingTips: ["Use San Juan worms and midges year-round", "Drift boat fishing covers the most water", "Fish early morning for rising trout on dry flies"] },

  // ARKANSAS
  { id: 9, name: "White River", type: "river", state: "Arkansas", address: "White River, Bull Shoals, AR 72619", fish: ["Rainbow Trout", "Brown Trout", "Cutthroat Trout", "Brook Trout"], cost: "Free (License Required)", description: "World-class tailwater trout fishery producing trophy browns over 20 lbs.", bestSeason: "Year-round", fishingTips: ["Fish sowbugs and scuds below Bull Shoals Dam", "Target brown trout with streamers at dusk", "Check generation schedules - low water is best for wading"] },
  { id: 10, name: "Lake Ouachita", type: "lake", state: "Arkansas", address: "Lake Ouachita, Hot Springs, AR 71913", fish: ["Largemouth Bass", "Striped Bass", "Bream", "Crappie", "Walleye"], cost: "Free (License Required)", description: "Crystal-clear Ouachita Mountain lake known for exceptional striped bass fishing.", bestSeason: "Spring", fishingTips: ["Fish points and humps for stripers with live shad", "Target standing timber for crappie", "Use finesse techniques in the ultra-clear water"] },

  // CALIFORNIA
  { id: 11, name: "Lake Tahoe", type: "lake", state: "California", address: "Lake Tahoe, CA 96150", fish: ["Rainbow Trout", "Brown Trout", "Mackinaw", "Kokanee Salmon"], cost: "Free (License Required)", description: "Crystal clear alpine lake straddling California and Nevada with trophy mackinaw.", bestSeason: "Summer & Fall", fishingTips: ["Troll deep for mackinaw with large spoons", "Fish near shore in spring for rainbow trout", "Target kokanee with dodger/hoochie combos in summer"] },
  { id: 12, name: "San Diego Bay", type: "ocean", state: "California", address: "San Diego Bay, San Diego, CA 92101", fish: ["Yellowtail", "Calico Bass", "Halibut", "Bonito", "Yellowfin Tuna"], cost: "Free (License Required)", description: "Year-round fishing in Southern California's premier bay and offshore waters.", bestSeason: "Summer", fishingTips: ["Book long-range trips for yellowfin tuna", "Fish kelp beds for calico bass with swimbaits", "Use live sardines for yellowtail at the islands"] },
  { id: 13, name: "Sacramento River", type: "river", state: "California", address: "Sacramento River, Redding, CA 96001", fish: ["Chinook Salmon", "Steelhead", "Rainbow Trout", "Striped Bass"], cost: "Free (License Required)", description: "Northern California's premier salmon and steelhead river with year-round fishing.", bestSeason: "Fall & Winter", fishingTips: ["Drift roe for fall chinook salmon", "Swing flies for winter steelhead", "Fish the upper river near Redding for wild trout"] },

  // COLORADO
  { id: 14, name: "South Platte River", type: "river", state: "Colorado", address: "Deckers, CO 80135", fish: ["Rainbow Trout", "Brown Trout", "Cutthroat Trout"], cost: "Free (License Required)", description: "Technical tailwater fishery in a stunning canyon with trophy trout on tiny flies.", bestSeason: "Year-round", fishingTips: ["Use size 22-26 midges in winter", "Sight fish to rising trout in the Cheesman Canyon", "Fish early morning before crowds arrive"] },
  { id: 15, name: "Blue Mesa Reservoir", type: "lake", state: "Colorado", address: "Blue Mesa Reservoir, Gunnison, CO 81230", fish: ["Kokanee Salmon", "Lake Trout", "Rainbow Trout", "Brown Trout"], cost: "Free (License Required)", description: "Colorado's largest body of water with excellent kokanee and lake trout fishing.", bestSeason: "Summer", fishingTips: ["Troll for kokanee with wedding ring spinners", "Jig for lake trout near the dam in winter", "Fish tributary inlets in spring for rainbows"] },

  // CONNECTICUT
  { id: 16, name: "Candlewood Lake", type: "lake", state: "Connecticut", address: "Candlewood Lake, New Fairfield, CT 06812", fish: ["Largemouth Bass", "Smallmouth Bass", "Walleye", "Perch", "Trout"], cost: "Free (License Required)", description: "Connecticut's largest lake offering diverse warm and cold water fishing.", bestSeason: "Spring & Summer", fishingTips: ["Fish rocky points for smallmouth in spring", "Target weed edges for largemouth with soft plastics", "Ice fish for walleye and perch in winter"] },
  { id: 17, name: "Housatonic River", type: "river", state: "Connecticut", address: "Housatonic River, Cornwall, CT 06796", fish: ["Brown Trout", "Rainbow Trout", "Smallmouth Bass"], cost: "Free (License Required)", description: "Premier fly fishing river in New England with wild brown trout populations.", bestSeason: "Spring & Fall", fishingTips: ["Fish the catch-and-release section in Cornwall", "Match the hatch during spring caddis emergences", "Use streamers for large browns in fall"] },

  // DELAWARE
  { id: 18, name: "Delaware Bay", type: "ocean", state: "Delaware", address: "Delaware Bay, Lewes, DE 19958", fish: ["Striped Bass", "Weakfish", "Bluefish", "Flounder", "Drum"], cost: "Free (License Required)", description: "Productive estuary with excellent surf fishing and bay fishing opportunities.", bestSeason: "Spring & Fall", fishingTips: ["Surf fish for stripers during the spring run", "Drift for flounder with live minnows in summer", "Fish the Indian River Inlet for bluefish in fall"] },
  { id: 19, name: "Lums Pond", type: "lake", state: "Delaware", address: "Lums Pond State Park, Bear, DE 19701", fish: ["Largemouth Bass", "Crappie", "Bluegill", "Catfish", "Pickerel"], cost: "State Park Fee + License", description: "Delaware's largest freshwater pond with excellent bass and panfish.", bestSeason: "Spring", fishingTips: ["Fish lily pads for largemouth with frogs", "Target fallen trees for crappie", "Use worms under a bobber for bluegill near shore"] },

  // FLORIDA
  { id: 20, name: "Lake Okeechobee", type: "lake", state: "Florida", address: "900 Okeechobee Blvd, Okeechobee, FL 34974", fish: ["Largemouth Bass", "Bluegill", "Crappie", "Catfish"], cost: "Free (License Required)", description: "One of the largest freshwater lakes in the US, famous for trophy bass fishing.", bestSeason: "Winter & Spring", fishingTips: ["Fish the grass lines with wild shiners for trophy bass", "Target the Monkey Box area for big bass", "Use artificial worms in the Kissimmee grass"] },
  { id: 21, name: "Florida Keys", type: "ocean", state: "Florida", address: "Florida Keys, Key West, FL 33040", fish: ["Tarpon", "Bonefish", "Permit", "Mahi-Mahi", "Sailfish"], cost: "Free (License Required)", description: "World-class flats fishing and offshore fishing in tropical paradise.", bestSeason: "Spring & Summer", fishingTips: ["Sight fish for tarpon in the backcountry channels in May", "Wade the flats for bonefish with shrimp flies", "Offshore trolling for mahi-mahi and sailfish"] },
  { id: 22, name: "St. Johns River", type: "river", state: "Florida", address: "St. Johns River, Palatka, FL 32177", fish: ["Largemouth Bass", "Crappie", "Striped Bass", "Catfish", "Shad"], cost: "Free (License Required)", description: "One of few north-flowing rivers in the US with excellent bass and shad fishing.", bestSeason: "Spring", fishingTips: ["Fish the shad run in February for incredible action", "Target bass in the lily pads with topwater", "Fish shell beds for crappie with jigs"] },

  // GEORGIA
  { id: 23, name: "Lake Lanier", type: "lake", state: "Georgia", address: "Lake Lanier, Buford, GA 30518", fish: ["Spotted Bass", "Largemouth Bass", "Striped Bass", "Crappie"], cost: "Free (License Required)", description: "Metro Atlanta's premier fishing lake with excellent spotted bass populations.", bestSeason: "Spring & Fall", fishingTips: ["Fish deep bluffs for spotted bass with jerkbaits", "Target stripers with live herring near the dam", "Fish docks for largemouth in summer"] },
  { id: 24, name: "Altamaha River", type: "river", state: "Georgia", address: "Altamaha River, Jesup, GA 31545", fish: ["Largemouth Bass", "Redbreast Sunfish", "Channel Catfish", "Striped Bass"], cost: "Free (License Required)", description: "Georgia's largest free-flowing river with incredible biodiversity.", bestSeason: "Spring", fishingTips: ["Fish oxbow lakes for trophy largemouth", "Use crickets for redbreast sunfish", "Target sandbars for catfish at night"] },

  // HAWAII
  { id: 25, name: "Kona Coast", type: "ocean", state: "Hawaii", address: "Kona Coast, Kailua-Kona, HI 96740", fish: ["Blue Marlin", "Yellowfin Tuna", "Mahi-Mahi", "Wahoo", "Ono"], cost: "Charter ($600-1,500/trip)", description: "World-famous big game fishing grounds known as the 'Marlin Capital of the World.'", bestSeason: "Summer & Fall", fishingTips: ["Book charter boats for blue marlin July-September", "Troll lures along the ledge for ahi tuna", "Fish FADs for mahi-mahi and ono"] },
  { id: 26, name: "Wahiawa Reservoir", type: "lake", state: "Hawaii", address: "Wahiawa Reservoir, Wahiawa, HI 96786", fish: ["Largemouth Bass", "Peacock Bass", "Tilapia", "Channel Catfish"], cost: "Free (License Required)", description: "Unique freshwater fishing in Hawaii with introduced bass species.", bestSeason: "Year-round", fishingTips: ["Fish early morning for peacock bass with topwater", "Target structure for largemouth bass", "Use cut bait for catfish near the dam"] },

  // IDAHO
  { id: 27, name: "Snake River", type: "river", state: "Idaho", address: "Snake River, Twin Falls, ID 83301", fish: ["Rainbow Trout", "Brown Trout", "Steelhead", "Sturgeon"], cost: "Free (License Required)", description: "Premier fly fishing destination with stunning canyon scenery and trophy trout.", bestSeason: "Summer & Fall", fishingTips: ["Float the South Fork for cutthroat trout", "Fish the Henry's Fork for technical dry fly fishing", "Target sturgeon in Hells Canyon with heavy tackle"] },
  { id: 28, name: "Lake Coeur d'Alene", type: "lake", state: "Idaho", address: "Lake Coeur d'Alene, Coeur d'Alene, ID 83814", fish: ["Chinook Salmon", "Rainbow Trout", "Largemouth Bass", "Northern Pike", "Kokanee"], cost: "Free (License Required)", description: "Stunning mountain lake with diverse fishing and beautiful scenery.", bestSeason: "Summer", fishingTips: ["Troll for chinook with downriggers in summer", "Fish the bays for largemouth bass", "Target northern pike in the Chain Lakes area"] },

  // ILLINOIS
  { id: 29, name: "Lake Michigan - Chicago", type: "lake", state: "Illinois", address: "Chicago Lakefront, Chicago, IL 60611", fish: ["Chinook Salmon", "Coho Salmon", "Steelhead", "Brown Trout", "Perch"], cost: "Free (License Required)", description: "World-class Great Lakes fishing accessible from downtown Chicago.", bestSeason: "Spring & Fall", fishingTips: ["Troll for salmon offshore in spring and fall", "Fish the harbors for perch in summer", "Target steelhead in tributary streams in fall"] },
  { id: 30, name: "Rend Lake", type: "lake", state: "Illinois", address: "Rend Lake, Benton, IL 62812", fish: ["Largemouth Bass", "Crappie", "Bluegill", "Catfish", "Walleye"], cost: "Free (License Required)", description: "Southern Illinois gem known for outstanding crappie and bass fishing.", bestSeason: "Spring", fishingTips: ["Fish standing timber for crappie with jigs", "Target riprap for bass in spring", "Use chicken liver for catfish near the spillway"] },

  // INDIANA
  { id: 31, name: "Patoka Lake", type: "lake", state: "Indiana", address: "Patoka Lake, Birdseye, IN 47513", fish: ["Largemouth Bass", "Crappie", "Bluegill", "Catfish", "Walleye"], cost: "Free (License Required)", description: "Indiana's second-largest reservoir with excellent multi-species fishing.", bestSeason: "Spring & Summer", fishingTips: ["Fish brush piles for crappie in spring", "Target rocky points for walleye at dawn", "Use topwater lures for bass in summer evenings"] },
  { id: 32, name: "Wabash River", type: "river", state: "Indiana", address: "Wabash River, Lafayette, IN 47901", fish: ["Smallmouth Bass", "Channel Catfish", "Flathead Catfish", "Sauger"], cost: "Free (License Required)", description: "Indiana's official state river with excellent smallmouth and catfish.", bestSeason: "Summer", fishingTips: ["Wade fish riffles for smallmouth with tube jigs", "Fish deep holes for flathead catfish at night", "Target dam tailwaters for sauger in fall"] },

  // IOWA
  { id: 33, name: "Spirit Lake", type: "lake", state: "Iowa", address: "Spirit Lake, Spirit Lake, IA 51360", fish: ["Walleye", "Yellow Perch", "Smallmouth Bass", "Northern Pike", "Muskie"], cost: "Free (License Required)", description: "Iowa's largest natural lake with exceptional walleye and perch fishing.", bestSeason: "Summer & Winter", fishingTips: ["Troll crankbaits for walleye in summer", "Ice fish for perch with wax worms", "Target muskie with large bucktails in fall"] },
  { id: 34, name: "Mississippi River - Pool 9", type: "river", state: "Iowa", address: "Mississippi River, Lansing, IA 52151", fish: ["Walleye", "Sauger", "Largemouth Bass", "Catfish", "Bluegill"], cost: "Free (License Required)", description: "Incredible backwater fishing on the Upper Mississippi with diverse species.", bestSeason: "Spring & Fall", fishingTips: ["Fish wing dams for walleye with jigs", "Target backwater sloughs for bass and bluegill", "Use cut shad for catfish in the main channel"] },

  // KANSAS
  { id: 35, name: "Milford Reservoir", type: "lake", state: "Kansas", address: "Milford Reservoir, Junction City, KS 66441", fish: ["Walleye", "Striped Bass", "White Bass", "Crappie", "Catfish"], cost: "Free (License Required)", description: "Kansas' largest lake with outstanding walleye and white bass fishing.", bestSeason: "Spring", fishingTips: ["Fish the white bass run in spring for non-stop action", "Troll for walleye with bottom bouncers", "Target stripers near the dam with live shad"] },
  { id: 36, name: "Flint Hills Pay Lake", type: "pay-lake", state: "Kansas", address: "1234 Fishing Rd, Emporia, KS 66801", fish: ["Channel Catfish", "Blue Catfish", "Rainbow Trout"], cost: "$40/day", description: "Family-friendly stocked fishing lake in the heart of the Flint Hills.", bestSeason: "Spring & Fall", fishingTips: ["Use stink bait for channel catfish", "Fish PowerBait for stocked rainbow trout", "Best fishing is early morning and late evening"] },

  // KENTUCKY
  { id: 37, name: "Kentucky Lake", type: "lake", state: "Kentucky", address: "Kentucky Lake, Gilbertsville, KY 42044", fish: ["Crappie", "Largemouth Bass", "Catfish", "Sauger", "Bluegill"], cost: "Free (License Required)", description: "One of the largest man-made lakes in the eastern US, crappie fishing capital.", bestSeason: "Spring", fishingTips: ["Spider rig for crappie over brush piles", "Fish ledges for summer bass with deep cranks", "Target the dam tailwaters for sauger in winter"] },
  { id: 38, name: "Dale Hollow Lake", type: "lake", state: "Kentucky", address: "Dale Hollow Lake, Burkesville, KY 42717", fish: ["Smallmouth Bass", "Walleye", "Rainbow Trout", "Muskie"], cost: "Free (License Required)", description: "Crystal-clear lake holding the world record smallmouth bass (11 lbs 15 oz).", bestSeason: "Spring & Summer", fishingTips: ["Fish rocky points for trophy smallmouth", "Troll deep for walleye near the dam", "Target muskie with large jerkbaits in fall"] },

  // LOUISIANA
  { id: 39, name: "Venice - Mississippi Delta", type: "ocean", state: "Louisiana", address: "Venice, LA 70091", fish: ["Red Drum", "Speckled Trout", "Yellowfin Tuna", "Red Snapper", "Tarpon"], cost: "Free (License Required)", description: "World-class inshore and offshore fishing at the mouth of the Mississippi.", bestSeason: "Year-round", fishingTips: ["Sight fish for redfish in the marsh with gold spoons", "Run offshore for yellowfin tuna at the rigs", "Fish live shrimp under corks for speckled trout"] },
  { id: 40, name: "Toledo Bend Reservoir", type: "lake", state: "Louisiana", address: "Toledo Bend, Many, LA 71449", fish: ["Largemouth Bass", "Crappie", "Catfish", "Striped Bass"], cost: "Free (License Required)", description: "Legendary bass lake on the Texas-Louisiana border producing giants.", bestSeason: "Spring", fishingTips: ["Fish hydrilla edges for bass with Texas rigs", "Target standing timber for crappie", "Use Carolina rigs on main lake points in summer"] },

  // MAINE
  { id: 41, name: "Moosehead Lake", type: "lake", state: "Maine", address: "Moosehead Lake, Greenville, ME 04441", fish: ["Landlocked Salmon", "Lake Trout", "Brook Trout", "Smallmouth Bass"], cost: "Free (License Required)", description: "Maine's largest lake surrounded by wilderness with excellent cold-water fishing.", bestSeason: "Spring & Fall", fishingTips: ["Troll streamers for landlocked salmon after ice-out", "Fish deep for lake trout with spoons", "Target brook trout in tributary streams"] },
  { id: 42, name: "Kennebec River", type: "river", state: "Maine", address: "Kennebec River, Augusta, ME 04330", fish: ["Striped Bass", "Atlantic Salmon", "Smallmouth Bass", "Brown Trout"], cost: "Free (License Required)", description: "Historic river with restored Atlantic salmon runs and excellent striper fishing.", bestSeason: "Summer", fishingTips: ["Fish the tidal section for stripers with live eels", "Target smallmouth in the upper river with crawfish", "Fly fish for Atlantic salmon in designated pools"] },

  // MARYLAND
  { id: 43, name: "Chesapeake Bay", type: "ocean", state: "Maryland", address: "Chesapeake Bay, MD", fish: ["Striped Bass", "Blue Crab", "Bluefish", "Flounder", "Red Drum"], cost: "Free (License Required)", description: "The largest estuary in the United States with incredible saltwater fishing.", bestSeason: "Spring & Fall", fishingTips: ["Troll for trophy stripers in spring near the Bay Bridge", "Chum for bluefish and stripers in fall", "Fish the shallows for red drum with cut bait"] },
  { id: 44, name: "Deep Creek Lake", type: "lake", state: "Maryland", address: "Deep Creek Lake, McHenry, MD 21541", fish: ["Walleye", "Largemouth Bass", "Yellow Perch", "Northern Pike", "Trout"], cost: "Free (License Required)", description: "Western Maryland's largest lake with excellent walleye and bass fishing.", bestSeason: "Spring & Summer", fishingTips: ["Jig for walleye along rocky shorelines", "Fish docks for largemouth in summer", "Ice fish for perch and walleye in winter"] },

  // MASSACHUSETTS
  { id: 45, name: "Cape Cod Bay", type: "ocean", state: "Massachusetts", address: "Cape Cod, Provincetown, MA 02657", fish: ["Striped Bass", "Bluefish", "Tuna", "Cod", "Fluke"], cost: "Free (License Required)", description: "Historic New England fishing waters with abundant stripers and bluefish.", bestSeason: "Summer & Fall", fishingTips: ["Surf cast for stripers at dawn and dusk", "Fish the Canal for stripers during tide changes", "Book offshore trips for bluefin tuna in fall"] },
  { id: 46, name: "Quabbin Reservoir", type: "lake", state: "Massachusetts", address: "Quabbin Reservoir, Belchertown, MA 01007", fish: ["Landlocked Salmon", "Lake Trout", "Smallmouth Bass", "Rainbow Trout"], cost: "Free (License Required)", description: "Pristine reservoir with trophy landlocked salmon and lake trout.", bestSeason: "Spring & Fall", fishingTips: ["Troll for salmon with lead core line in spring", "Fish deep for lakers with tube jigs", "Shore fish for smallmouth at accessible points"] },

  // MICHIGAN
  { id: 47, name: "Lake Michigan", type: "lake", state: "Michigan", address: "Lake Michigan, MI", fish: ["Chinook Salmon", "Steelhead", "Lake Trout", "Walleye", "Perch"], cost: "Free (License Required)", description: "One of the Great Lakes with world-class salmon and steelhead fishing.", bestSeason: "Spring & Fall", fishingTips: ["Troll for salmon with downriggers in spring", "Fish the Pere Marquette River for steelhead", "Target perch near piers in summer"] },
  { id: 48, name: "Au Sable River", type: "river", state: "Michigan", address: "Au Sable River, Grayling, MI 49738", fish: ["Brown Trout", "Rainbow Trout", "Brook Trout", "Smallmouth Bass"], cost: "Free (License Required)", description: "Michigan's most famous trout stream with legendary hex hatch fishing.", bestSeason: "Summer", fishingTips: ["Fish the hex hatch in June for trophy browns", "Wade the Holy Waters section for dry fly fishing", "Use small nymphs and streamers in the flies-only water"] },
  { id: 49, name: "Lake St. Clair", type: "lake", state: "Michigan", address: "Lake St. Clair, Harrison Township, MI 48045", fish: ["Smallmouth Bass", "Muskie", "Walleye", "Perch", "Largemouth Bass"], cost: "Free (License Required)", description: "World-class smallmouth bass fishery with crystal-clear water.", bestSeason: "Summer", fishingTips: ["Fish the flats for smallmouth with tube jigs", "Target muskie with large jerkbaits in fall", "Drift for walleye near the shipping channel"] },

  // MINNESOTA
  { id: 50, name: "Mille Lacs Lake", type: "lake", state: "Minnesota", address: "Mille Lacs Lake, Garrison, MN 56450", fish: ["Walleye", "Northern Pike", "Smallmouth Bass", "Muskie", "Perch"], cost: "Free (License Required)", description: "Minnesota's premier walleye lake with massive open-water structure.", bestSeason: "Summer & Winter", fishingTips: ["Fish mud flats for walleye with leeches", "Target rock reefs for smallmouth", "Ice fish for walleye with jigging Raps in winter"] },
  { id: 51, name: "Boundary Waters", type: "lake", state: "Minnesota", address: "Boundary Waters Canoe Area, Ely, MN 55731", fish: ["Walleye", "Northern Pike", "Smallmouth Bass", "Lake Trout", "Brook Trout"], cost: "Permit Required ($16/day)", description: "Pristine wilderness canoe area with over 1,000 lakes and incredible fishing.", bestSeason: "Summer", fishingTips: ["Portage to remote lakes for less pressure", "Fish rocky points for walleye at dusk", "Target lake trout in deep cold lakes"] },

  // MISSISSIPPI
  { id: 52, name: "Ross Barnett Reservoir", type: "lake", state: "Mississippi", address: "Ross Barnett Reservoir, Brandon, MS 39042", fish: ["Largemouth Bass", "Crappie", "Catfish", "Bluegill"], cost: "Free (License Required)", description: "Central Mississippi's top fishing destination with excellent bass and crappie.", bestSeason: "Spring", fishingTips: ["Fish grass edges for bass with spinnerbaits", "Target brush piles for crappie with minnows", "Night fish for catfish with cut shad"] },
  { id: 53, name: "Mississippi Gulf Coast", type: "ocean", state: "Mississippi", address: "Biloxi, MS 39530", fish: ["Red Drum", "Speckled Trout", "Flounder", "Sheepshead", "Cobia"], cost: "Free (License Required)", description: "Barrier island fishing with excellent inshore and nearshore opportunities.", bestSeason: "Fall", fishingTips: ["Fish the barrier islands for speckled trout", "Target bull reds in the marshes in fall", "Use live shrimp for flounder near passes"] },

  // MISSOURI
  { id: 54, name: "Lake of the Ozarks", type: "lake", state: "Missouri", address: "Lake of the Ozarks, Osage Beach, MO 65065", fish: ["Largemouth Bass", "Crappie", "Catfish", "Bluegill", "Paddlefish"], cost: "Free (License Required)", description: "Popular Midwest lake with over 1,150 miles of shoreline and great bass fishing.", bestSeason: "Spring & Fall", fishingTips: ["Fish docks for bass with jigs in summer", "Target brush piles for crappie in spring", "Snag for paddlefish below Truman Dam in spring"] },
  { id: 55, name: "Table Rock Lake", type: "lake", state: "Missouri", address: "Table Rock Lake, Branson, MO 65616", fish: ["Largemouth Bass", "Spotted Bass", "White Bass", "Crappie", "Walleye"], cost: "Free (License Required)", description: "Clear Ozarks lake with outstanding spotted bass and white bass fishing.", bestSeason: "Spring", fishingTips: ["Fish deep bluffs for spotted bass with drop shots", "Chase white bass schooling on the surface in fall", "Target walleye near the dam with jigs"] },

  // MONTANA
  { id: 56, name: "Yellowstone River", type: "river", state: "Montana", address: "Yellowstone River, Livingston, MT 59047", fish: ["Cutthroat Trout", "Rainbow Trout", "Brown Trout", "Mountain Whitefish"], cost: "Free (License Required)", description: "Pristine fly fishing in America's longest undammed river.", bestSeason: "Summer & Fall", fishingTips: ["Float the Paradise Valley section for cutthroat", "Fish hoppers and attractors in late summer", "Target brown trout with streamers in fall"] },
  { id: 57, name: "Fort Peck Reservoir", type: "lake", state: "Montana", address: "Fort Peck Reservoir, Glasgow, MT 59230", fish: ["Walleye", "Northern Pike", "Smallmouth Bass", "Lake Trout", "Chinook Salmon"], cost: "Free (License Required)", description: "Massive Missouri River reservoir with incredible walleye and pike fishing.", bestSeason: "Summer", fishingTips: ["Troll for walleye with bottom bouncers", "Target pike in shallow bays in spring", "Fish deep for lake trout near the dam"] },

  // NEBRASKA
  { id: 58, name: "Lake McConaughy", type: "lake", state: "Nebraska", address: "Lake McConaughy, Ogallala, NE 69153", fish: ["Walleye", "White Bass", "Channel Catfish", "Rainbow Trout", "Wiper"], cost: "Free (License Required)", description: "Nebraska's largest reservoir with sandy beaches and excellent walleye fishing.", bestSeason: "Spring & Summer", fishingTips: ["Fish the white bass run at the inlet in spring", "Troll for walleye along the dam face", "Shore fish for catfish at night with cut shad"] },
  { id: 59, name: "Calamus Reservoir", type: "lake", state: "Nebraska", address: "Calamus Reservoir, Burwell, NE 68823", fish: ["Walleye", "Northern Pike", "Largemouth Bass", "Crappie", "Perch"], cost: "Free (License Required)", description: "Sandhills gem with outstanding walleye and northern pike fishing.", bestSeason: "Summer", fishingTips: ["Fish rocky points for walleye at dawn", "Target weed beds for northern pike", "Use minnows under bobbers for crappie"] },

  // NEVADA
  { id: 60, name: "Lake Mead", type: "lake", state: "Nevada", address: "Lake Mead National Recreation Area, Boulder City, NV 89005", fish: ["Striped Bass", "Largemouth Bass", "Catfish", "Bluegill", "Rainbow Trout"], cost: "Free (License Required)", description: "Desert oasis with excellent striped bass fishing in dramatic canyon scenery.", bestSeason: "Spring & Fall", fishingTips: ["Chase boiling stripers with topwater in spring", "Fish coves for largemouth with soft plastics", "Target catfish near marinas at night"] },
  { id: 61, name: "Pyramid Lake", type: "lake", state: "Nevada", address: "Pyramid Lake, Sutcliffe, NV 89510", fish: ["Lahontan Cutthroat Trout", "Sacramento Perch"], cost: "Tribal Permit Required ($12/day)", description: "Ancient desert lake with trophy Lahontan cutthroat trout over 20 lbs.", bestSeason: "Winter & Spring", fishingTips: ["Ladder fish from shore in winter for trophy cutthroat", "Use woolly buggers and streamers", "Fish the Nets area for best access"] },

  // NEW HAMPSHIRE
  { id: 62, name: "Lake Winnipesaukee", type: "lake", state: "New Hampshire", address: "Lake Winnipesaukee, Laconia, NH 03246", fish: ["Landlocked Salmon", "Lake Trout", "Smallmouth Bass", "Rainbow Trout"], cost: "Free (License Required)", description: "New Hampshire's largest lake with excellent salmon and bass fishing.", bestSeason: "Spring & Summer", fishingTips: ["Troll for salmon with lead core in spring", "Fish rocky islands for smallmouth in summer", "Ice fish for lake trout in winter"] },
  { id: 63, name: "Connecticut River - NH", type: "river", state: "New Hampshire", address: "Connecticut River, Pittsburg, NH 03592", fish: ["Rainbow Trout", "Brown Trout", "Brook Trout", "Landlocked Salmon"], cost: "Free (License Required)", description: "Upper Connecticut River with pristine trout fishing in remote wilderness.", bestSeason: "Summer", fishingTips: ["Fish the Trophy Stretch for large browns", "Use dry flies during summer hatches", "Target brook trout in small tributaries"] },

  // NEW JERSEY
  { id: 64, name: "Barnegat Bay", type: "ocean", state: "New Jersey", address: "Barnegat Bay, Barnegat Light, NJ 08006", fish: ["Striped Bass", "Bluefish", "Fluke", "Weakfish", "Winter Flounder"], cost: "Free (License Required)", description: "Jersey Shore's premier bay fishing with excellent striper and fluke action.", bestSeason: "Summer & Fall", fishingTips: ["Drift for fluke with bucktails and Gulp", "Fish the inlet for stripers on the outgoing tide", "Target weakfish with soft plastics at night"] },
  { id: 65, name: "Round Valley Reservoir", type: "lake", state: "New Jersey", address: "Round Valley Reservoir, Lebanon, NJ 08833", fish: ["Lake Trout", "Brown Trout", "Smallmouth Bass", "Largemouth Bass"], cost: "Free (License Required)", description: "Deep, clear reservoir with trophy lake trout and brown trout.", bestSeason: "Spring & Fall", fishingTips: ["Troll deep for lake trout with spoons", "Fish rocky points for smallmouth", "Shore fish for trout after spring stocking"] },

  // NEW MEXICO
  { id: 66, name: "Elephant Butte Lake", type: "lake", state: "New Mexico", address: "Elephant Butte Lake, Truth or Consequences, NM 87901", fish: ["Largemouth Bass", "Striped Bass", "Walleye", "Catfish", "White Bass"], cost: "Free (License Required)", description: "New Mexico's largest lake with excellent warm-water fishing in the desert.", bestSeason: "Spring & Fall", fishingTips: ["Fish rocky points for bass in spring", "Target stripers with live shad near the dam", "Night fish for walleye with jigs and minnows"] },
  { id: 67, name: "San Juan River", type: "river", state: "New Mexico", address: "San Juan River, Navajo Dam, NM 87419", fish: ["Rainbow Trout", "Brown Trout"], cost: "Free (License Required)", description: "Blue-ribbon tailwater with trophy trout averaging 16-20 inches.", bestSeason: "Year-round", fishingTips: ["Use tiny midges and San Juan worms", "Fish the quality water section for best results", "Sight fish to rising trout with dry-dropper rigs"] },

  // NEW YORK
  { id: 68, name: "Salmon River", type: "river", state: "New York", address: "Salmon River, Pulaski, NY 13142", fish: ["Chinook Salmon", "Coho Salmon", "Steelhead", "Brown Trout"], cost: "Free (License Required)", description: "East Coast salmon and steelhead mecca with massive fall runs.", bestSeason: "Fall & Winter", fishingTips: ["Drift eggs for chinook in October", "Swing flies for steelhead in winter", "Fish egg patterns below spawning salmon"] },
  { id: 69, name: "Montauk Point", type: "ocean", state: "New York", address: "Montauk Point, Montauk, NY 11954", fish: ["Striped Bass", "Bluefish", "Fluke", "Porgy", "Tuna"], cost: "Free (License Required)", description: "Legendary surf fishing destination at the tip of Long Island.", bestSeason: "Fall", fishingTips: ["Surf cast for stripers during the fall blitz", "Fish the rips for bluefish with metal lures", "Book offshore trips for tuna in summer"] },
  { id: 70, name: "Finger Lakes", type: "lake", state: "New York", address: "Seneca Lake, Geneva, NY 14456", fish: ["Lake Trout", "Rainbow Trout", "Brown Trout", "Landlocked Salmon", "Perch"], cost: "Free (License Required)", description: "Deep glacial lakes with excellent cold-water fishing and stunning scenery.", bestSeason: "Spring & Fall", fishingTips: ["Troll for lake trout in the deep basins", "Fish tributary streams for steelhead in fall", "Target perch near docks in summer"] },

  // NORTH CAROLINA
  { id: 71, name: "Outer Banks", type: "ocean", state: "North Carolina", address: "Outer Banks, Nags Head, NC 27959", fish: ["Blue Marlin", "Yellowfin Tuna", "Wahoo", "Mahi-Mahi", "Red Drum"], cost: "Free (License Required)", description: "Premier offshore fishing destination on the East Coast with the Gulf Stream nearby.", bestSeason: "Summer & Fall", fishingTips: ["Book offshore charters for marlin and tuna", "Surf fish for red drum in fall", "Fish the inlets for flounder and speckled trout"] },
  { id: 72, name: "Lake Norman", type: "lake", state: "North Carolina", address: "Lake Norman, Mooresville, NC 28117", fish: ["Largemouth Bass", "Striped Bass", "Catfish", "Crappie"], cost: "Free (License Required)", description: "Charlotte's backyard lake with excellent striped bass and largemouth fishing.", bestSeason: "Spring & Fall", fishingTips: ["Fish docks for largemouth with jigs", "Target stripers with live herring near the dam", "Fish brush piles for crappie in spring"] },

  // NORTH DAKOTA
  { id: 73, name: "Lake Sakakawea", type: "lake", state: "North Dakota", address: "Lake Sakakawea, Garrison, ND 58540", fish: ["Walleye", "Northern Pike", "Smallmouth Bass", "Chinook Salmon", "Lake Trout"], cost: "Free (License Required)", description: "Massive Missouri River reservoir with world-class walleye fishing.", bestSeason: "Summer", fishingTips: ["Troll bottom bouncers for walleye on the flats", "Fish rocky points for smallmouth bass", "Target pike in shallow bays in spring"] },
  { id: 74, name: "Devils Lake", type: "lake", state: "North Dakota", address: "Devils Lake, Devils Lake, ND 58301", fish: ["Walleye", "Northern Pike", "Perch", "White Bass"], cost: "Free (License Required)", description: "North Dakota's largest natural lake with incredible walleye and perch fishing.", bestSeason: "Summer & Winter", fishingTips: ["Jig for walleye along the rocky reefs", "Ice fish for perch with minnows", "Target pike in the coulees in spring"] },

  // OHIO
  { id: 75, name: "Lake Erie", type: "lake", state: "Ohio", address: "Lake Erie, Cleveland, OH 44114", fish: ["Walleye", "Yellow Perch", "Steelhead", "Smallmouth Bass"], cost: "Free (License Required)", description: "Walleye capital of the world with excellent perch and steelhead fishing.", bestSeason: "Spring & Fall", fishingTips: ["Troll for walleye with worm harnesses in summer", "Fish the reefs for perch in fall", "Target steelhead in tributaries October-April"] },
  { id: 76, name: "Ohio River", type: "river", state: "Ohio", address: "Ohio River, Cincinnati, OH 45202", fish: ["Sauger", "Hybrid Striped Bass", "Channel Catfish", "Largemouth Bass", "Flathead Catfish"], cost: "Free (License Required)", description: "Major river system with excellent sauger and catfish fishing below dams.", bestSeason: "Fall & Winter", fishingTips: ["Fish dam tailwaters for sauger with jigs", "Target flathead catfish with live bluegill", "Fish backwater areas for largemouth bass"] },

  // OKLAHOMA
  { id: 77, name: "Grand Lake O' the Cherokees", type: "lake", state: "Oklahoma", address: "Grand Lake, Grove, OK 74344", fish: ["Largemouth Bass", "Crappie", "Catfish", "Hybrid Striped Bass", "Paddlefish"], cost: "Free (License Required)", description: "Northeast Oklahoma's premier lake with excellent bass and paddlefish snagging.", bestSeason: "Spring", fishingTips: ["Fish the Grand River arm for bass", "Snag for paddlefish below Pensacola Dam in spring", "Target crappie in brush piles with jigs"] },
  { id: 78, name: "Broken Bow Lake", type: "lake", state: "Oklahoma", address: "Broken Bow Lake, Broken Bow, OK 74728", fish: ["Largemouth Bass", "Smallmouth Bass", "Walleye", "Brown Trout"], cost: "Free (License Required)", description: "Clear mountain lake with trophy smallmouth and trout in the tailwater below.", bestSeason: "Spring & Fall", fishingTips: ["Fish rocky bluffs for smallmouth with jerkbaits", "Target brown trout in the tailwater with flies", "Fish deep for walleye near the dam"] },

  // OREGON
  { id: 79, name: "Deschutes River", type: "river", state: "Oregon", address: "Deschutes River, Maupin, OR 97037", fish: ["Rainbow Trout", "Steelhead", "Chinook Salmon", "Brown Trout"], cost: "Free (License Required)", description: "Oregon's premier fly fishing river with wild redsides and summer steelhead.", bestSeason: "Summer & Fall", fishingTips: ["Fish the salmonfly hatch in late May", "Swing flies for summer steelhead July-October", "Use dry flies for redsides in the canyon"] },
  { id: 80, name: "Tillamook Bay", type: "ocean", state: "Oregon", address: "Tillamook Bay, Garibaldi, OR 97118", fish: ["Chinook Salmon", "Coho Salmon", "Dungeness Crab", "Sturgeon", "Perch"], cost: "Free (License Required)", description: "Productive Oregon coast bay with excellent salmon and crabbing.", bestSeason: "Fall", fishingTips: ["Troll for chinook in the bay in August", "Fish for coho near the jetties in September", "Crab the bay flats on incoming tides"] },

  // PENNSYLVANIA
  { id: 81, name: "Lake Erie - PA", type: "lake", state: "Pennsylvania", address: "Presque Isle Bay, Erie, PA 16505", fish: ["Steelhead", "Walleye", "Smallmouth Bass", "Perch", "Largemouth Bass"], cost: "Free (License Required)", description: "Pennsylvania's Great Lake access with incredible steelhead tributaries.", bestSeason: "Fall & Winter", fishingTips: ["Fish Elk Creek for steelhead October-March", "Target walleye near Presque Isle in spring", "Fish the bay for bass and perch in summer"] },
  { id: 82, name: "Delaware River", type: "river", state: "Pennsylvania", address: "Delaware River, Philadelphia, PA 19106", fish: ["Shad", "Striped Bass", "Smallmouth Bass", "Trout", "Muskie"], cost: "Free (License Required)", description: "Excellent shad runs and year-round bass fishing in a historic river.", bestSeason: "Spring", fishingTips: ["Fish the shad run in April-May with dart jigs", "Target smallmouth in the upper river with crawfish", "Fish the Delaware Water Gap for trophy trout"] },

  // RHODE ISLAND
  { id: 83, name: "Block Island", type: "ocean", state: "Rhode Island", address: "Block Island, New Shoreham, RI 02807", fish: ["Striped Bass", "Bluefish", "Fluke", "Black Sea Bass", "Tautog"], cost: "Free (License Required)", description: "Island fishing paradise with incredible striper fishing and diverse species.", bestSeason: "Summer & Fall", fishingTips: ["Fish the Southwest Ledge for stripers", "Drift for fluke around the island", "Target tautog on rocky structure with green crabs"] },
  { id: 84, name: "Narragansett Bay", type: "ocean", state: "Rhode Island", address: "Narragansett Bay, Warwick, RI 02886", fish: ["Striped Bass", "Bluefish", "Scup", "Tautog", "Winter Flounder"], cost: "Free (License Required)", description: "New England's largest estuary with year-round fishing opportunities.", bestSeason: "Summer", fishingTips: ["Fish the Providence River for schoolie stripers", "Target tautog around bridge pilings", "Drift for scup over sandy bottoms"] },

  // SOUTH CAROLINA
  { id: 85, name: "Lake Murray", type: "lake", state: "South Carolina", address: "Lake Murray, Irmo, SC 29063", fish: ["Largemouth Bass", "Striped Bass", "Crappie", "Catfish", "Bream"], cost: "Free (License Required)", description: "Columbia's premier lake with excellent bass and striper fishing.", bestSeason: "Spring & Fall", fishingTips: ["Fish rocky points for bass in spring", "Target stripers with live herring near the dam", "Fish brush piles for crappie with minnows"] },
  { id: 86, name: "Charleston Harbor", type: "ocean", state: "South Carolina", address: "Charleston Harbor, Charleston, SC 29401", fish: ["Red Drum", "Flounder", "Speckled Trout", "Sheepshead", "Tarpon"], cost: "Free (License Required)", description: "Historic port city with incredible inshore fishing in the Lowcountry.", bestSeason: "Fall", fishingTips: ["Sight fish for tailing redfish on the flats", "Fish dock pilings for sheepshead with fiddler crabs", "Target flounder in the creeks with live minnows"] },

  // SOUTH DAKOTA
  { id: 87, name: "Lake Oahe", type: "lake", state: "South Dakota", address: "Lake Oahe, Pierre, SD 57501", fish: ["Walleye", "Chinook Salmon", "Northern Pike", "Smallmouth Bass"], cost: "Free (License Required)", description: "One of the largest dams in the US with world-class walleye fishing.", bestSeason: "Summer", fishingTips: ["Troll for walleye with bottom bouncers and crawlers", "Target salmon near the dam with spoons", "Fish creek arms for northern pike in spring"] },
  { id: 88, name: "Lake Sharpe", type: "lake", state: "South Dakota", address: "Lake Sharpe, Chamberlain, SD 57325", fish: ["Walleye", "Channel Catfish", "Smallmouth Bass", "Northern Pike"], cost: "Free (License Required)", description: "Missouri River reservoir with consistent walleye fishing and scenic bluffs.", bestSeason: "Summer & Fall", fishingTips: ["Fish the flats for walleye with jigs and minnows", "Target catfish below Big Bend Dam", "Fish rocky points for smallmouth"] },

  // TENNESSEE
  { id: 89, name: "Norris Lake", type: "lake", state: "Tennessee", address: "Norris Lake, Rocky Top, TN 37769", fish: ["Striped Bass", "Walleye", "Largemouth Bass", "Crappie", "Smallmouth Bass"], cost: "Free (License Required)", description: "Crystal-clear TVA lake with outstanding striped bass and walleye.", bestSeason: "Spring & Fall", fishingTips: ["Fish the thermocline for stripers in summer", "Target walleye near the dam with jigs", "Fish rocky banks for smallmouth with crawfish"] },
  { id: 90, name: "Reelfoot Lake", type: "lake", state: "Tennessee", address: "Reelfoot Lake, Tiptonville, TN 38079", fish: ["Crappie", "Largemouth Bass", "Bluegill", "Catfish"], cost: "Free (License Required)", description: "Earthquake-formed lake famous for incredible crappie fishing in cypress trees.", bestSeason: "Spring", fishingTips: ["Fish cypress trees for crappie with jigs and minnows", "Target bass in lily pads with frogs", "Use crickets for giant bluegill in summer"] },

  // TEXAS
  { id: 91, name: "Lake Fork", type: "lake", state: "Texas", address: "Lake Fork, Quitman, TX 75783", fish: ["Largemouth Bass", "Crappie", "Catfish"], cost: "Free (License Required)", description: "Texas trophy bass lake producing numerous state records over 13 lbs.", bestSeason: "Spring", fishingTips: ["Fish timber lines for bass with Carolina rigs", "Target spawning bass in shallow coves in spring", "Use live shiners for trophy bass"] },
  { id: 92, name: "Gulf of Mexico - Texas", type: "ocean", state: "Texas", address: "Port Aransas, TX 78373", fish: ["Red Snapper", "Mahi-Mahi", "Tuna", "Kingfish", "Tarpon", "Red Drum"], cost: "Free (License Required)", description: "Deep sea fishing paradise with trophy game fish and incredible inshore fishing.", bestSeason: "Summer & Fall", fishingTips: ["Book offshore trips for red snapper in June", "Wade fish the flats for redfish with gold spoons", "Target tarpon in the passes in summer"] },
  { id: 93, name: "Falcon Lake", type: "lake", state: "Texas", address: "Falcon Lake, Zapata, TX 78076", fish: ["Largemouth Bass", "Catfish", "Striped Bass"], cost: "Free (License Required)", description: "Border lake famous for giant largemouth bass in warm South Texas waters.", bestSeason: "Winter & Spring", fishingTips: ["Fish brush piles for bass with jigs", "Target bass in flooded timber with crankbaits", "Best fishing is December through March"] },

  // UTAH
  { id: 94, name: "Lake Powell - Utah", type: "lake", state: "Utah", address: "Lake Powell, Bullfrog, UT 84533", fish: ["Striped Bass", "Largemouth Bass", "Smallmouth Bass", "Walleye", "Crappie"], cost: "Free (License Required)", description: "Red-rock reservoir paradise with incredible striper fishing in canyon country.", bestSeason: "Spring & Fall", fishingTips: ["Find boiling stripers with electronics in spring", "Fish canyon walls for smallmouth with drop shots", "Target walleye at night near the dam"] },
  { id: 95, name: "Green River", type: "river", state: "Utah", address: "Green River, Dutch John, UT 84023", fish: ["Rainbow Trout", "Brown Trout", "Cutthroat Trout"], cost: "Free (License Required)", description: "World-class tailwater below Flaming Gorge Dam with trophy trout.", bestSeason: "Year-round", fishingTips: ["Fish cicada patterns in June for explosive strikes", "Use small midges and scuds year-round", "Float the A Section for best access"] },

  // VERMONT
  { id: 96, name: "Lake Champlain", type: "lake", state: "Vermont", address: "Lake Champlain, Burlington, VT 05401", fish: ["Landlocked Salmon", "Lake Trout", "Smallmouth Bass", "Northern Pike", "Walleye"], cost: "Free (License Required)", description: "Historic lake with diverse cold and warm water species and stunning views.", bestSeason: "Spring & Summer", fishingTips: ["Troll for salmon near the Inland Sea in spring", "Fish rocky shoals for smallmouth in summer", "Target pike in Missisquoi Bay with spinnerbaits"] },
  { id: 97, name: "Battenkill River", type: "river", state: "Vermont", address: "Battenkill River, Manchester, VT 05254", fish: ["Brown Trout", "Brook Trout", "Rainbow Trout"], cost: "Free (License Required)", description: "Classic New England trout stream with wild brown trout in pastoral setting.", bestSeason: "Spring & Summer", fishingTips: ["Fish early morning and evening for wary browns", "Use small dry flies and light tippet", "Target brook trout in the upper tributaries"] },

  // VIRGINIA
  { id: 98, name: "James River", type: "river", state: "Virginia", address: "James River, Richmond, VA 23219", fish: ["Smallmouth Bass", "Largemouth Bass", "Catfish", "Shad", "Striped Bass"], cost: "Free (License Required)", description: "Urban river with incredible smallmouth fishing through downtown Richmond.", bestSeason: "Spring & Summer", fishingTips: ["Wade fish for smallmouth with crawfish patterns", "Target shad runs in spring below the falls", "Fish the tidal section for stripers"] },
  { id: 99, name: "Smith Mountain Lake", type: "lake", state: "Virginia", address: "Smith Mountain Lake, Moneta, VA 24121", fish: ["Striped Bass", "Largemouth Bass", "Smallmouth Bass", "Crappie", "Muskie"], cost: "Free (License Required)", description: "Virginia's most popular lake with excellent striper and muskie fishing.", bestSeason: "Spring & Fall", fishingTips: ["Fish live bait for stripers near the dam", "Target muskie with large swimbaits in fall", "Fish docks for largemouth in summer"] },

  // WASHINGTON
  { id: 100, name: "Puget Sound", type: "ocean", state: "Washington", address: "Puget Sound, Seattle, WA 98101", fish: ["Chinook Salmon", "Coho Salmon", "Halibut", "Lingcod", "Dungeness Crab"], cost: "Free (License Required)", description: "Pacific Northwest saltwater fishing at its finest with salmon and bottomfish.", bestSeason: "Summer & Fall", fishingTips: ["Mooch for chinook with cut-plug herring", "Jig for lingcod on rocky structure", "Crab the shallow bays on incoming tides"] },
  { id: 101, name: "Columbia River", type: "river", state: "Washington", address: "Columbia River, Astoria, OR-WA", fish: ["Chinook Salmon", "Steelhead", "Sturgeon", "Walleye", "Shad"], cost: "Free (License Required)", description: "Mighty Pacific Northwest river with legendary salmon and sturgeon runs.", bestSeason: "Spring & Fall", fishingTips: ["Troll for spring chinook with herring", "Fish below Bonneville Dam for sturgeon", "Target walleye near the John Day Dam"] },

  // WEST VIRGINIA
  { id: 102, name: "New River", type: "river", state: "West Virginia", address: "New River Gorge, Fayetteville, WV 25840", fish: ["Smallmouth Bass", "Rock Bass", "Channel Catfish", "Flathead Catfish", "Muskie"], cost: "Free (License Required)", description: "Ancient river with spectacular gorge scenery and excellent smallmouth fishing.", bestSeason: "Summer", fishingTips: ["Float the gorge section for smallmouth with tubes", "Fish deep pools for flathead catfish at night", "Target muskie in the lower river with large lures"] },
  { id: 103, name: "Summersville Lake", type: "lake", state: "West Virginia", address: "Summersville Lake, Summersville, WV 26651", fish: ["Smallmouth Bass", "Largemouth Bass", "Walleye", "Crappie", "Trout"], cost: "Free (License Required)", description: "Crystal-clear mountain lake with exceptional smallmouth bass fishing.", bestSeason: "Spring & Summer", fishingTips: ["Fish rocky banks for smallmouth with crawfish", "Target walleye near the dam at night", "Use finesse tactics in the ultra-clear water"] },

  // WISCONSIN
  { id: 104, name: "Lake Winnebago", type: "lake", state: "Wisconsin", address: "Lake Winnebago, Oshkosh, WI 54901", fish: ["Walleye", "White Bass", "Sturgeon", "Perch", "Northern Pike"], cost: "Free (License Required)", description: "Wisconsin's largest inland lake famous for walleye and sturgeon spearing.", bestSeason: "Spring & Winter", fishingTips: ["Fish the Wolf River for walleye during the spring run", "Spear sturgeon through the ice in February", "Target white bass at the Fox River mouth in spring"] },
  { id: 105, name: "Chippewa Flowage", type: "lake", state: "Wisconsin", address: "Chippewa Flowage, Hayward, WI 54843", fish: ["Muskie", "Walleye", "Largemouth Bass", "Crappie", "Bluegill"], cost: "Free (License Required)", description: "Home of the former world record muskie, a legendary Northwoods fishery.", bestSeason: "Summer & Fall", fishingTips: ["Cast large bucktails for muskie in fall", "Fish weed edges for walleye with jigs", "Target crappie in the flowage bays in spring"] },

  // WYOMING
  { id: 106, name: "North Platte River", type: "river", state: "Wyoming", address: "North Platte River, Casper, WY 82601", fish: ["Rainbow Trout", "Brown Trout", "Walleye", "Sauger"], cost: "Free (License Required)", description: "Blue-ribbon trout water flowing through Wyoming's high plains.", bestSeason: "Summer & Fall", fishingTips: ["Float the Miracle Mile for trophy trout", "Fish below Alcova Dam for large browns", "Use PMD and caddis patterns in summer"] },
  { id: 107, name: "Yellowstone Lake", type: "lake", state: "Wyoming", address: "Yellowstone Lake, Yellowstone National Park, WY 82190", fish: ["Cutthroat Trout", "Lake Trout"], cost: "National Park Fee ($35/vehicle)", description: "High-altitude lake in Yellowstone with native cutthroat trout conservation.", bestSeason: "Summer", fishingTips: ["Fish the outlet for cutthroat in June", "Target cutthroat along the shoreline with flies", "Lake trout must be killed - help conservation efforts"] },

  // ADDITIONAL SPOTS FOR COVERAGE
  { id: 108, name: "Santee Cooper Lakes", type: "lake", state: "South Carolina", address: "Lake Marion, Santee, SC 29142", fish: ["Largemouth Bass", "Striped Bass", "Catfish", "Crappie", "Bluegill"], cost: "Free (License Required)", description: "Twin lakes famous for trophy catfish and excellent bass fishing.", bestSeason: "Spring", fishingTips: ["Fish the diversion canal for stripers", "Target trophy blue catfish with cut shad", "Fish cypress trees for crappie in spring"] },
  { id: 109, name: "Flaming Gorge Reservoir", type: "lake", state: "Wyoming", address: "Flaming Gorge, Green River, WY 82935", fish: ["Lake Trout", "Kokanee Salmon", "Rainbow Trout", "Smallmouth Bass", "Burbot"], cost: "Free (License Required)", description: "Stunning red-rock reservoir with trophy lake trout and kokanee salmon.", bestSeason: "Summer", fishingTips: ["Troll deep for lake trout with large spoons", "Fish for kokanee with dodger/fly combos", "Target smallmouth in the Lucerne area"] },
  { id: 110, name: "Apalachicola River", type: "river", state: "Florida", address: "Apalachicola River, Blountstown, FL 32424", fish: ["Largemouth Bass", "Striped Bass", "Catfish", "Bream", "Sturgeon"], cost: "Free (License Required)", description: "Wild Florida river with diverse fishing and Gulf sturgeon populations.", bestSeason: "Spring", fishingTips: ["Fish oxbow lakes for trophy bass", "Target catfish in deep holes with cut bait", "Fish the river mouth for stripers in winter"] },
  { id: 111, name: "Rainy Lake", type: "lake", state: "Minnesota", address: "Rainy Lake, International Falls, MN 56649", fish: ["Walleye", "Northern Pike", "Smallmouth Bass", "Crappie", "Sauger"], cost: "Free (License Required)", description: "Border water wilderness lake with outstanding walleye and pike fishing.", bestSeason: "Summer", fishingTips: ["Fish the islands for walleye with jigs and minnows", "Target pike in shallow bays with spinnerbaits", "Fish deep rock piles for smallmouth"] },
  { id: 112, name: "Chattooga River", type: "river", state: "Georgia", address: "Chattooga River, Clayton, GA 30525", fish: ["Brown Trout", "Rainbow Trout", "Brook Trout", "Smallmouth Bass"], cost: "Free (License Required)", description: "Wild and scenic river on the GA-SC border with excellent mountain trout.", bestSeason: "Spring & Fall", fishingTips: ["Fish the delayed harvest section for best trout", "Use terrestrial patterns in summer", "Target wild brook trout in headwater streams"] },
  { id: 113, name: "Lake Texoma", type: "lake", state: "Oklahoma", address: "Lake Texoma, Kingston, OK 73439", fish: ["Striped Bass", "Largemouth Bass", "Smallmouth Bass", "Catfish", "Crappie"], cost: "Free (License Required)", description: "Red River reservoir famous for naturally reproducing striped bass.", bestSeason: "Spring & Fall", fishingTips: ["Fish the striper boils with topwater in fall", "Target bass along rocky points in spring", "Use live shad for trophy stripers"] },
  { id: 114, name: "Beaverkill River", type: "river", state: "New York", address: "Beaverkill River, Roscoe, NY 12776", fish: ["Brown Trout", "Rainbow Trout", "Brook Trout"], cost: "Free (License Required)", description: "Birthplace of American fly fishing with historic pools and wild trout.", bestSeason: "Spring & Summer", fishingTips: ["Fish the Hendrickson hatch in April", "Target the Junction Pool in Roscoe", "Use small dry flies and light tippet for wary trout"] },
  { id: 115, name: "Saginaw Bay", type: "lake", state: "Michigan", address: "Saginaw Bay, Bay City, MI 48706", fish: ["Walleye", "Yellow Perch", "Smallmouth Bass", "Channel Catfish"], cost: "Free (License Required)", description: "Lake Huron bay with incredible walleye and perch fishing.", bestSeason: "Spring & Fall", fishingTips: ["Troll for walleye with worm harnesses in summer", "Fish the reefs for perch in fall", "Target catfish near the river mouths"] },

  // DAMS
  { id: 116, name: "Hoover Dam", type: "dam", state: "Nevada", address: "Hoover Dam Access Rd, Boulder City, NV 89005", fish: ["Striped Bass", "Rainbow Trout", "Largemouth Bass", "Channel Catfish"], cost: "Free (License Required)", description: "Iconic dam on the Colorado River with excellent striped bass fishing in the tailwaters.", bestSeason: "Spring & Fall", fishingTips: ["Fish the tailwaters for rainbow trout with PowerBait", "Target stripers from the shore with swimbaits", "Night fishing for catfish near the dam face"] },
  { id: 117, name: "Bonneville Dam", type: "dam", state: "Oregon", address: "Bonneville Dam, Cascade Locks, OR 97014", fish: ["Chinook Salmon", "Steelhead", "Sturgeon", "Shad"], cost: "Free (License Required)", description: "Historic Columbia River dam famous for salmon and steelhead runs.", bestSeason: "Spring & Fall", fishingTips: ["Fish below the dam for spring chinook with herring", "Target sturgeon with sand shrimp in the tailrace", "Shad fishing is incredible in June"] },
  { id: 118, name: "Kentucky Dam", type: "dam", state: "Kentucky", address: "Kentucky Dam, Gilbertsville, KY 42044", fish: ["Crappie", "Largemouth Bass", "Catfish", "Sauger", "Striped Bass"], cost: "Free (License Required)", description: "Gateway to Kentucky Lake with excellent crappie and sauger in the tailwaters.", bestSeason: "Spring & Winter", fishingTips: ["Fish the tailwaters for sauger with jigs in winter", "Target crappie in the discharge area", "Use cut shad for catfish below the dam"] },
  { id: 119, name: "Table Rock Dam", type: "dam", state: "Missouri", address: "Table Rock Dam, Branson, MO 65616", fish: ["Rainbow Trout", "Brown Trout", "Largemouth Bass"], cost: "Free (License Required)", description: "Popular Ozarks destination with trophy trout in the cold tailwaters.", bestSeason: "Year-round", fishingTips: ["Fish scuds and sowbugs in the tailwater", "Target brown trout with streamers at dusk", "Check generation schedules for wade fishing"] },
  { id: 120, name: "Glen Canyon Dam", type: "dam", state: "Arizona", address: "Glen Canyon Dam, Page, AZ 86040", fish: ["Rainbow Trout", "Brown Trout", "Striped Bass"], cost: "Free (License Required)", description: "Famous for trophy trout fishing in the cold tailwaters of the Colorado River.", bestSeason: "Year-round", fishingTips: ["Book a guided float trip through the canyon", "Use San Juan worms and midges", "Fish early morning for best dry fly action"] },

  // PRIVATE WATERS
  { id: 121, name: "Big Bear Lake Private Resort", type: "private", state: "California", address: "123 Private Lake Rd, Big Bear Lake, CA 92315", fish: ["Rainbow Trout", "Brown Trout", "Largemouth Bass"], cost: "$150/day", description: "Exclusive private fishing resort with stocked waters and guaranteed catches.", bestSeason: "Spring & Fall", fishingTips: ["Use PowerBait for stocked rainbow trout", "Fish structure for brown trout with streamers", "Early morning is best for bass on topwater"] },
  { id: 122, name: "Private Trout Stream", type: "private", state: "Colorado", address: "567 Exclusive Waters Rd, Vail, CO 81657", fish: ["Rainbow Trout", "Brown Trout", "Brook Trout", "Cutthroat Trout"], cost: "$300/day", description: "Private spring creek with trophy wild trout in a stunning mountain valley.", bestSeason: "Summer", fishingTips: ["Sight fish to rising trout with dry flies", "Use 6X tippet minimum for wary fish", "Fish the evening hatch for best dry fly action"] },
  { id: 123, name: "Georgia Bass Club Lake", type: "private", state: "Georgia", address: "789 Members Only Dr, Atlanta, GA 30301", fish: ["Largemouth Bass", "Spotted Bass", "Bluegill"], cost: "$200/day (Members Only)", description: "Exclusive bass fishing club with trophy-managed waters and catch records.", bestSeason: "Spring", fishingTips: ["Fish the grass lines for trophy largemouth", "Target spotted bass on deep structure", "Use live shiners for the biggest bass"] },

  // PAY LAKES
  { id: 124, name: "Trophy Trout Pay Lake", type: "pay-lake", state: "Tennessee", address: "456 Fisherman Way, Nashville, TN 37201", fish: ["Rainbow Trout", "Golden Trout", "Brook Trout"], cost: "$75/day", description: "Pay-to-fish lake stocked with trophy-sized trout including rare golden trout.", bestSeason: "Winter & Spring", fishingTips: ["Use PowerBait in bright colors for stocked trout", "Fish early morning for best action", "Try corn and worms for a natural presentation"] },
  { id: 125, name: "Family Fun Pay Lake", type: "pay-lake", state: "Indiana", address: "890 Family Fish Ln, Indianapolis, IN 46201", fish: ["Channel Catfish", "Rainbow Trout", "Bluegill"], cost: "$25/person", description: "Great for families with kids, no license required, guaranteed catches.", bestSeason: "Summer", fishingTips: ["Use worms under a bobber for bluegill", "Try chicken liver for catfish", "Kids love fishing with corn for trout"] },

  // ========================================
  // URBAN FISHING LOCATIONS
  // ========================================

  // NEW YORK - Urban
  { id: 126, name: "Central Park - Harlem Meer", type: "lake", state: "New York", address: "Harlem Meer, Central Park, New York, NY 10029", fish: ["Largemouth Bass", "Bluegill", "Crappie", "Channel Catfish", "Carp"], cost: "Free (Catch & Release Only)", description: "NYC's most iconic urban fishing spot in the heart of Central Park. The Dana Discovery Center provides free loaner fishing poles and bait from April through October, making it perfect for families and first-time anglers.", bestSeason: "Spring & Summer", fishingTips: ["Borrow free fishing gear from the Dana Discovery Center", "Use worms under a bobber for bluegill - great for kids", "Fish early morning before crowds arrive for best bass action", "Target the deeper north end for larger bass and catfish"] },
  { id: 127, name: "Prospect Park Lake", type: "lake", state: "New York", address: "Prospect Park, Brooklyn, NY 11215", fish: ["Largemouth Bass", "Bluegill", "Carp", "Chain Pickerel", "Catfish"], cost: "Free (Catch & Release Only)", description: "Brooklyn's beloved urban fishing destination in Frederick Law Olmsted's masterpiece park. The 60-acre lake offers surprisingly good fishing just minutes from downtown Brooklyn.", bestSeason: "Spring & Summer", fishingTips: ["Fish the Lullwater area for the best bass habitat", "Use bread balls for carp along the shoreline", "Early morning weekdays offer the most peaceful fishing", "Bring your own gear - no loaner programs available"] },

  // ILLINOIS - Urban
  { id: 128, name: "Lincoln Park Lagoon", type: "lake", state: "Illinois", address: "Lincoln Park, Chicago, IL 60614", fish: ["Largemouth Bass", "Bluegill", "Channel Catfish", "Carp", "Crappie"], cost: "Free (License Required)", description: "A hidden urban fishing gem in Chicago's most popular park. The South Lagoon offers peaceful fishing with stunning skyline views, and the Chicago Park District hosts free family fishing events.", bestSeason: "Summer", fishingTips: ["Fish the South Lagoon near Café Brauer for best access", "Use worms and bobbers for guaranteed bluegill action with kids", "Target catfish at dusk with chicken liver or stink bait", "Join the free Chicago Park District fishing programs in summer"] },

  // TEXAS - Urban
  { id: 129, name: "Hermann Park McGovern Lake", type: "lake", state: "Texas", address: "Hermann Park, Houston, TX 77030", fish: ["Largemouth Bass", "Bluegill", "Channel Catfish", "Tilapia", "Carp"], cost: "Free (License Required)", description: "Houston's premier urban fishing lake in the heart of the Museum District. The 8-acre lake is regularly stocked and offers easy bank access perfect for families with young children.", bestSeason: "Year-round", fishingTips: ["Fish near the Japanese Garden bridge for catfish", "Use crickets or worms for bluegill along the shoreline", "Early morning before joggers arrive is best for bass", "The lake is stocked regularly - check Houston Parks for schedules"] },
  { id: 130, name: "White Rock Lake", type: "lake", state: "Texas", address: "White Rock Lake Park, Dallas, TX 75218", fish: ["Largemouth Bass", "White Bass", "Channel Catfish", "Crappie", "Bluegill", "Carp"], cost: "Free (License Required)", description: "Dallas's urban fishing paradise covering 1,015 acres just 5 miles from downtown. The lake offers diverse fishing opportunities from shore or kayak with a scenic 9-mile trail.", bestSeason: "Spring & Fall", fishingTips: ["Fish the spillway area for white bass during spring runs", "Target rocky points for largemouth with crankbaits", "Shore fish the east side for catfish with cut shad", "Kayak fishing opens up the best coves and structure"] },
  { id: 131, name: "Lady Bird Lake", type: "lake", state: "Texas", address: "Lady Bird Lake, Austin, TX 78701", fish: ["Largemouth Bass", "Guadalupe Bass", "Sunfish", "Carp", "Channel Catfish"], cost: "Free (License Required)", description: "Austin's iconic downtown reservoir on the Colorado River, home to the state fish - the Guadalupe Bass. Kayak and paddleboard fishing are popular with stunning skyline views.", bestSeason: "Spring & Fall", fishingTips: ["Kayak fish the coves near Red Bud Isle for bass", "Target Guadalupe bass near rocky structure with small crankbaits", "Fish under the Congress Avenue Bridge at dawn for best action", "Motorized boats are prohibited - paddle craft only"] },
  { id: 132, name: "Sheldon Lake State Park", type: "lake", state: "Texas", address: "Sheldon Lake State Park, Houston, TX 77044", fish: ["Largemouth Bass", "Bluegill", "Channel Catfish", "Crappie", "Redear Sunfish"], cost: "Free (No License Required for Kids Under 17)", description: "Houston's best family fishing destination with a dedicated kids' fishing pond, nature center, and easy shoreline access. The park hosts regular family fishing clinics and provides loaner gear.", bestSeason: "Spring & Summer", fishingTips: ["Start kids at the John Jacob Observation Deck pond for easy catches", "Use worms under bobbers for guaranteed bluegill and sunfish", "The main lake has excellent bass fishing from the fishing pier", "Attend the free family fishing clinics held monthly"] },

  // ARIZONA - Urban
  { id: 133, name: "Tempe Town Lake", type: "lake", state: "Arizona", address: "Tempe Town Lake, Tempe, AZ 85281", fish: ["Largemouth Bass", "Channel Catfish", "Rainbow Trout", "Bluegill", "Carp"], cost: "Free (License Required)", description: "A 220-acre urban lake in the heart of the Phoenix metro area, stocked with rainbow trout in winter and catfish year-round. The paved paths and easy access make it ideal for families.", bestSeason: "Winter & Spring", fishingTips: ["Fish for stocked rainbow trout November through March", "Target catfish near the dam at night with stink bait", "Use PowerBait for trout from the north shore", "Early morning fishing avoids the desert heat and crowds"] },
  { id: 134, name: "Lake Havasu", type: "lake", state: "Arizona", address: "Lake Havasu, Lake Havasu City, AZ 86403", fish: ["Largemouth Bass", "Striped Bass", "Smallmouth Bass", "Channel Catfish", "Redear Sunfish", "Crappie"], cost: "Free (License Required)", description: "One of the top bass fishing lakes in the West, set against stunning desert canyon scenery. The warm Colorado River water produces year-round bass fishing with multiple 10+ lb fish caught annually.", bestSeason: "Spring & Fall", fishingTips: ["Fish the tules and cattail edges for spawning bass in spring", "Target stripers near the dam with live shad or swimbaits", "Fish the London Bridge area for easy shore access", "Use drop shot rigs on rocky points for smallmouth"] },

  // CALIFORNIA - Urban
  { id: 135, name: "Lake Merritt", type: "lake", state: "California", address: "Lake Merritt, Oakland, CA 94612", fish: ["Striped Bass", "Bat Ray", "Leopard Shark", "Perch", "Carp"], cost: "Free (License Required)", description: "America's oldest wildlife refuge is also a unique urban fishing spot in downtown Oakland. This tidal lagoon connected to San Francisco Bay offers surprising saltwater species in a city setting.", bestSeason: "Summer & Fall", fishingTips: ["Fish incoming tides for striped bass near the channel", "Target bat rays with squid on the bottom at night", "Use pile worms for perch along the shoreline", "The 12th Street bridge area is the most productive spot"] },
  { id: 136, name: "Santee Lakes", type: "lake", state: "California", address: "Santee Lakes Recreation Preserve, Santee, CA 92071", fish: ["Rainbow Trout", "Channel Catfish", "Largemouth Bass", "Bluegill", "Carp", "Sturgeon"], cost: "$8-10/day (Fishing Fee)", description: "San Diego's premier family fishing destination with 7 lakes, playgrounds, and camping. Lakes are heavily stocked with trout in winter and catfish in summer, making catches almost guaranteed for kids.", bestSeason: "Year-round", fishingTips: ["Lake 5 is the best for kids with easy bank access and stocked fish", "Use PowerBait for trout in winter months", "Fish chicken liver for catfish in summer evenings", "Attend the kids' fishing derbies held throughout the year"] },

  // WASHINGTON DC - Urban
  { id: 137, name: "Anacostia River", type: "river", state: "Virginia", address: "Anacostia River, Washington, DC 20003", fish: ["Largemouth Bass", "Snakehead", "Blue Catfish", "Channel Catfish", "Carp", "Bluegill"], cost: "Free (DC License Required)", description: "The nation's capital offers surprisingly excellent urban fishing along the revitalized Anacostia River. Northern snakehead, an invasive but exciting gamefish, has made this a unique fishing destination.", bestSeason: "Spring & Summer", fishingTips: ["Target snakehead in shallow weedy areas with topwater frogs", "Fish Kenilworth Aquatic Gardens for bass and snakehead", "Blue catfish are abundant - use cut shad on the bottom", "The Anacostia Riverwalk Trail provides great bank access"] },

  // COLORADO - Urban
  { id: 138, name: "Sloan's Lake", type: "lake", state: "Colorado", address: "Sloan's Lake Park, Denver, CO 80204", fish: ["Rainbow Trout", "Largemouth Bass", "Channel Catfish", "Carp", "Bluegill", "Crappie"], cost: "Free (License Required)", description: "Denver's largest lake offers excellent urban fishing with stunning Rocky Mountain views. Stocked with rainbow trout and warm-water species, it's a favorite for Denver families.", bestSeason: "Spring & Fall", fishingTips: ["Fish for stocked trout in spring and fall with PowerBait", "Target bass in the weed beds with soft plastics in summer", "Shore fish the south side for best catfish action at night", "Ice fishing is popular in winter for trout and perch"] },

  // TENNESSEE - Urban
  { id: 139, name: "Percy Priest Lake", type: "lake", state: "Tennessee", address: "J. Percy Priest Lake, Nashville, TN 37214", fish: ["Largemouth Bass", "Smallmouth Bass", "Crappie", "Striped Bass", "Catfish", "Bluegill"], cost: "Free (License Required)", description: "Nashville's backyard lake just 10 miles from downtown, offering 14,200 acres of excellent multi-species fishing. Multiple free public access points and boat ramps make it accessible for all.", bestSeason: "Spring & Fall", fishingTips: ["Fish the rocky bluffs for smallmouth with tube jigs", "Target crappie in brush piles near the marinas in spring", "Stripers school near the dam - use live shad or umbrella rigs", "The Stones River arm has the best bass fishing"] },

  // OREGON - Urban
  { id: 140, name: "Westmoreland Park Casting Pond", type: "lake", state: "Oregon", address: "Westmoreland Park, Portland, OR 97202", fish: ["Rainbow Trout", "Bluegill", "Largemouth Bass", "Crappie"], cost: "Free (License Required)", description: "Portland's beloved urban fishing pond in the heart of SE Portland. Stocked with rainbow trout by ODFW, it's a perfect spot for teaching kids to fish with easy bank access and a playground nearby.", bestSeason: "Spring", fishingTips: ["Fish right after ODFW stocking for best trout action", "Use PowerBait or worms under a bobber for kids", "The east bank has the deepest water and best trout holding areas", "Combine fishing with a visit to the adjacent playground"] },

  // MINNESOTA - Urban
  { id: 141, name: "Lake Nokomis", type: "lake", state: "Minnesota", address: "Lake Nokomis, Minneapolis, MN 55417", fish: ["Largemouth Bass", "Northern Pike", "Bluegill", "Crappie", "Walleye", "Carp"], cost: "Free (License Required)", description: "A Minneapolis Chain of Lakes gem offering excellent urban fishing with a swimming beach, playground, and picnic areas. The 204-acre lake is perfect for combining family activities with fishing.", bestSeason: "Summer", fishingTips: ["Fish the weed edges for largemouth bass with spinnerbaits", "Target northern pike near the inlet with large minnows", "Shore fish the south beach area for bluegill with kids", "Ice fish for walleye and panfish in winter - very popular"] },

  // ========================================
  // KID-FRIENDLY FISHING SPOTS
  // ========================================

  { id: 142, name: "Chatfield State Park Kids' Pond", type: "lake", state: "Colorado", address: "Chatfield State Park, Littleton, CO 80125", fish: ["Rainbow Trout", "Bluegill", "Channel Catfish", "Largemouth Bass"], cost: "State Park Fee ($10/vehicle)", description: "Colorado's best kids' fishing destination with a dedicated children's pond stocked weekly during summer. The shallow, accessible pond has paved paths, benches, and guaranteed catches for young anglers.", bestSeason: "Summer", fishingTips: ["The kids' pond is stocked every Thursday - fish Friday morning for best results", "Use worms under a bobber for bluegill - perfect for beginners", "PowerBait in bright colors works great for stocked trout", "Bring a picnic - there are tables and shade right by the pond"] },
  { id: 143, name: "Burke Lake", type: "lake", state: "Virginia", address: "Burke Lake Park, Fairfax Station, VA 22039", fish: ["Largemouth Bass", "Bluegill", "Channel Catfish", "Crappie", "Muskie", "Walleye"], cost: "Free (License Required)", description: "Northern Virginia's premier family fishing lake with a fishing pier, boat rentals, playground, carousel, and mini-train. The 218-acre lake is stocked regularly and offers excellent shoreline access.", bestSeason: "Spring & Summer", fishingTips: ["Fish from the pier for easy access with kids", "Use nightcrawlers under a bobber for bluegill and crappie", "Rent a rowboat to access deeper bass and catfish areas", "The marina cove is the best spot for young anglers"] },
  { id: 144, name: "Lake Ella", type: "lake", state: "Florida", address: "Lake Ella, Tallahassee, FL 32303", fish: ["Largemouth Bass", "Bluegill", "Channel Catfish", "Tilapia", "Carp"], cost: "Free (License Required)", description: "Tallahassee's charming urban lake surrounded by shops and restaurants. The small, accessible lake is perfect for introducing kids to fishing with easy shoreline access and shallow water.", bestSeason: "Year-round", fishingTips: ["Use bread balls for tilapia and carp - kids love the instant action", "Fish worms under a bobber for bluegill along the shore", "Target bass near the fountain with small plastic worms", "Combine fishing with a treat from the surrounding shops"] },
  { id: 145, name: "Greenfield Lake", type: "lake", state: "North Carolina", address: "Greenfield Lake Park, Wilmington, NC 28401", fish: ["Largemouth Bass", "Bluegill", "Crappie", "Channel Catfish", "Bowfin"], cost: "Free (License Required)", description: "A beautiful cypress-lined lake in Wilmington with a 5-mile trail, playground, and amphitheater. The shallow, warm lake is perfect for kids with easy bank access and abundant panfish.", bestSeason: "Spring & Summer", fishingTips: ["Fish near the cypress trees for bass with plastic worms", "Use crickets for bluegill along the walking trail", "The fishing pier near the amphitheater is great for kids", "Watch for alligators - they're part of the experience!"] },
  { id: 146, name: "Hueston Woods State Park Lake", type: "lake", state: "Ohio", address: "Hueston Woods State Park, College Corner, OH 45003", fish: ["Largemouth Bass", "Bluegill", "Channel Catfish", "Crappie", "Saugeye"], cost: "Free (License Required)", description: "Ohio's top family fishing destination with a 625-acre lake, nature center, beach, and lodge. The park hosts free kids' fishing clinics and has multiple accessible fishing piers.", bestSeason: "Spring & Summer", fishingTips: ["Fish from the accessible pier near the beach for panfish", "Attend the free kids' fishing clinics in June", "Use worms and bobbers for guaranteed bluegill catches", "Rent a boat from the marina to access deeper crappie spots"] },
  { id: 147, name: "Mirror Lake State Park", type: "lake", state: "Wisconsin", address: "Mirror Lake State Park, Baraboo, WI 53913", fish: ["Largemouth Bass", "Bluegill", "Northern Pike", "Crappie", "Perch"], cost: "State Park Fee ($8/vehicle)", description: "A stunning sandstone-cliff lake near Wisconsin Dells, perfect for combining family vacation with fishing. The calm, clear water and sandy beaches make it ideal for kids.", bestSeason: "Summer", fishingTips: ["Fish from the canoe/kayak for best access to bass habitat", "Use worms near the sandy beach for bluegill with kids", "Target pike in the lily pads at the north end", "Combine with a visit to nearby Wisconsin Dells attractions"] },
  { id: 148, name: "Lake Accotink", type: "lake", state: "Virginia", address: "Lake Accotink Park, Springfield, VA 22150", fish: ["Largemouth Bass", "Bluegill", "Channel Catfish", "Crappie", "Carp"], cost: "Free (License Required)", description: "A beloved family fishing spot in suburban Northern Virginia with a playground, carousel, boat rentals, and easy shoreline access. The 55-acre lake is perfect for young anglers.", bestSeason: "Spring & Summer", fishingTips: ["Fish from the dam area for the deepest water and biggest catfish", "Use worms under a bobber near the playground for bluegill", "Rent a pedal boat to combine fun with fishing", "The creek inlet area holds bass and crappie in spring"] },
  { id: 149, name: "Scottsdale Ranch Park Lake", type: "lake", state: "Arizona", address: "Scottsdale Ranch Park, Scottsdale, AZ 85258", fish: ["Rainbow Trout", "Channel Catfish", "Largemouth Bass", "Bluegill", "Tilapia"], cost: "Free (License Required)", description: "A popular urban fishing lake in Scottsdale stocked with trout in winter by AZGFD. The park features a playground, walking paths, and easy bank access ideal for families.", bestSeason: "Winter & Spring", fishingTips: ["Fish for stocked trout December through March with PowerBait", "Target catfish in summer evenings with hot dogs or chicken liver", "Use worms under a bobber for bluegill near the playground", "The south shore has the best shade for comfortable fishing"] },

  // ========================================
  // UNDERREPRESENTED STATES - ADDITIONAL SPOTS
  // ========================================

  // CONNECTICUT
  { id: 150, name: "East Twin Lake", type: "lake", state: "Connecticut", address: "East Twin Lake, Salisbury, CT 06068", fish: ["Largemouth Bass", "Smallmouth Bass", "Northern Pike", "Yellow Perch", "Rainbow Trout", "Brown Trout"], cost: "Free (License Required)", description: "One of Connecticut's deepest natural lakes in the scenic Litchfield Hills. The cold, clear water supports both warm and cold-water species with excellent trout fishing.", bestSeason: "Spring & Fall", fishingTips: ["Troll for trout in the deep basin with lead core line", "Fish rocky points for smallmouth with tube jigs", "Target pike in the weed beds with large spinnerbaits", "Ice fishing for perch and trout is excellent in winter"] },

  // DELAWARE
  { id: 151, name: "Killens Pond", type: "lake", state: "Delaware", address: "Killens Pond State Park, Felton, DE 19943", fish: ["Largemouth Bass", "Bluegill", "Crappie", "Channel Catfish", "Pickerel"], cost: "State Park Fee + License", description: "Delaware's most popular family fishing destination with a water park, nature center, and campground. The 66-acre pond is stocked regularly and has excellent shoreline access.", bestSeason: "Spring & Summer", fishingTips: ["Fish from the pier near the nature center for easy panfish", "Use worms and bobbers for bluegill - perfect for kids", "Target bass in the lily pads with topwater frogs", "Combine fishing with the water park for a full family day"] },

  // HAWAII
  { id: 152, name: "Ala Wai Canal", type: "river", state: "Hawaii", address: "Ala Wai Canal, Honolulu, HI 96815", fish: ["Tilapia", "Papio (Trevally)", "Barracuda", "Mullet", "Bonefish"], cost: "Free (License Required)", description: "Waikiki's urban fishing canal where locals and tourists fish for papio and tilapia. An accessible spot just steps from the famous beach, offering a unique tropical urban fishing experience.", bestSeason: "Year-round", fishingTips: ["Fish the mouth near the harbor for papio on incoming tides", "Use bread balls or shrimp for tilapia along the canal walls", "Early morning and evening are best to avoid the heat", "Bring a net - the canal walls make landing fish tricky"] },

  // IDAHO
  { id: 153, name: "Henry's Lake", type: "lake", state: "Idaho", address: "Henry's Lake, Island Park, ID 83429", fish: ["Cutthroat Trout", "Brook Trout", "Cutthroat-Rainbow Hybrid"], cost: "Free (License Required)", description: "One of the premier trophy trout lakes in the West, producing cutthroat trout averaging 3-5 lbs. Located near Yellowstone, it's a must-visit for serious trout anglers.", bestSeason: "Summer & Fall", fishingTips: ["Fish leeches and damselfly nymphs for trophy cutthroat", "Float tube fishing is the most effective method", "Target the inlet streams in early summer for cruising fish", "Use woolly buggers stripped slowly along weed edges"] },

  // IOWA
  { id: 154, name: "Clear Lake", type: "lake", state: "Iowa", address: "Clear Lake, Clear Lake, IA 50428", fish: ["Walleye", "Yellow Bass", "Largemouth Bass", "Bluegill", "Channel Catfish", "Northern Pike"], cost: "Free (License Required)", description: "Iowa's third-largest natural lake and a popular family vacation destination. Known for excellent yellow bass fishing and a charming lakeside town with resorts and restaurants.", bestSeason: "Summer & Winter", fishingTips: ["Target yellow bass schools with small jigs and minnows", "Fish the rock reefs for walleye at dawn and dusk", "Ice fishing for walleye and perch is outstanding", "The south shore has the best family-friendly access points"] },

  // KANSAS
  { id: 155, name: "El Dorado Reservoir", type: "lake", state: "Kansas", address: "El Dorado State Park, El Dorado, KS 67042", fish: ["Walleye", "Striped Bass", "White Bass", "Crappie", "Channel Catfish", "Largemouth Bass"], cost: "State Park Fee + License", description: "Kansas' most popular state park lake with 8,000 acres of excellent multi-species fishing. The park offers camping, swimming beaches, and extensive shoreline access for families.", bestSeason: "Spring & Fall", fishingTips: ["Fish the white bass run at the Walnut River inlet in spring", "Troll for walleye with bottom bouncers along the dam", "Target crappie in brush piles near the marina", "Night fishing for catfish at the spillway is excellent"] },

  // MAINE
  { id: 156, name: "Sebago Lake", type: "lake", state: "Maine", address: "Sebago Lake, Windham, ME 04062", fish: ["Landlocked Salmon", "Lake Trout", "Smallmouth Bass", "Largemouth Bass", "Brown Trout", "White Perch"], cost: "Free (License Required)", description: "Maine's second-largest lake and the birthplace of landlocked salmon fishing in America. Crystal-clear water and stunning scenery make it a premier New England fishing destination.", bestSeason: "Spring & Fall", fishingTips: ["Troll for landlocked salmon with streamer flies after ice-out", "Fish the Crooked River inlet for salmon and trout in spring", "Target smallmouth on rocky islands with tube jigs in summer", "The Songo River area is excellent for bass and perch"] },

  // MARYLAND
  { id: 157, name: "Liberty Reservoir", type: "lake", state: "Maryland", address: "Liberty Reservoir, Eldersburg, MD 21784", fish: ["Largemouth Bass", "Smallmouth Bass", "Brown Trout", "Tiger Muskie", "Crappie", "Bluegill"], cost: "Free (License Required)", description: "Baltimore's drinking water reservoir offering trophy brown trout and tiger muskie fishing. Electric motors only create a peaceful, uncrowded fishing experience.", bestSeason: "Spring & Fall", fishingTips: ["Troll for brown trout with Rapala minnows in spring", "Target tiger muskie with large jerkbaits near rocky points", "Fish the upper arms for bass in the warmer months", "Electric motors only - plan for a quiet, peaceful trip"] },

  // MASSACHUSETTS
  { id: 158, name: "Wachusett Reservoir", type: "lake", state: "Massachusetts", address: "Wachusett Reservoir, West Boylston, MA 01583", fish: ["Lake Trout", "Landlocked Salmon", "Smallmouth Bass", "Brown Trout", "Rainbow Trout"], cost: "Free (License Required)", description: "Central Massachusetts' premier cold-water fishery and Boston's drinking water supply. Shore fishing only with strict regulations, but produces trophy lake trout and salmon.", bestSeason: "Spring & Fall", fishingTips: ["Shore fish only - no boats allowed on this reservoir", "Cast large spoons for lake trout from accessible points", "Fish the spring stocking for rainbow and brown trout", "The south shore access points offer the best casting"] },

  // MONTANA
  { id: 159, name: "Flathead Lake", type: "lake", state: "Montana", address: "Flathead Lake, Polson, MT 59860", fish: ["Lake Trout", "Bull Trout", "Yellow Perch", "Lake Whitefish", "Westslope Cutthroat Trout", "Northern Pike"], cost: "Free (License Required)", description: "The largest natural freshwater lake west of the Mississippi, with crystal-clear water and stunning Mission Mountain views. Trophy lake trout over 30 lbs are caught annually.", bestSeason: "Summer & Fall", fishingTips: ["Troll deep for lake trout with large spoons and downriggers", "Fish the east shore for yellow perch with small jigs", "Target bull trout near river mouths in fall - catch and release only", "The Narrows area between Big and Little Flathead is prime"] },

  // NEBRASKA
  { id: 160, name: "Merritt Reservoir", type: "lake", state: "Nebraska", address: "Merritt Reservoir, Valentine, NE 69201", fish: ["Walleye", "Northern Pike", "Largemouth Bass", "Muskie", "Channel Catfish", "Crappie"], cost: "Free (License Required)", description: "A Sandhills gem known for trophy muskie and walleye in a remote, scenic setting. The clear water and abundant forage produce exceptional fish growth rates.", bestSeason: "Summer & Fall", fishingTips: ["Target muskie with large bucktails and jerkbaits in fall", "Fish rocky points for walleye at dawn with jigs and minnows", "The Snake River arm has the best bass fishing", "Night fishing for walleye near the dam is very productive"] },

  // NEW HAMPSHIRE
  { id: 161, name: "Squam Lake", type: "lake", state: "New Hampshire", address: "Squam Lake, Holderness, NH 03245", fish: ["Landlocked Salmon", "Lake Trout", "Smallmouth Bass", "Rainbow Trout", "Pickerel"], cost: "Free (License Required)", description: "The filming location of 'On Golden Pond' and one of New Hampshire's most pristine lakes. Excellent cold-water fishing in a stunning natural setting with loon calls echoing across the water.", bestSeason: "Spring & Summer", fishingTips: ["Troll for salmon with lead core line in spring after ice-out", "Fish the islands for smallmouth bass with crawfish patterns", "Target lake trout deep near Rattlesnake Island", "Respect the peaceful atmosphere - this is a quiet lake"] },

  // NEW JERSEY
  { id: 162, name: "Spruce Run Reservoir", type: "lake", state: "New Jersey", address: "Spruce Run Recreation Area, Clinton, NJ 08809", fish: ["Largemouth Bass", "Hybrid Striped Bass", "Trout", "Northern Pike", "Crappie", "Catfish"], cost: "State Park Fee + License", description: "Central New Jersey's top multi-species fishery with 1,290 acres of excellent fishing. The reservoir is stocked with trout and hybrid stripers, and has a swimming beach and campground.", bestSeason: "Spring & Summer", fishingTips: ["Troll for hybrid stripers with crankbaits near the dam", "Fish the inlet area for trout after spring stocking", "Target pike in the weed beds with large spinnerbaits", "The south shore has the best family-friendly access"] },

  // NEW MEXICO
  { id: 163, name: "Heron Lake", type: "lake", state: "New Mexico", address: "Heron Lake State Park, Los Ojos, NM 87551", fish: ["Kokanee Salmon", "Rainbow Trout", "Lake Trout", "Smallmouth Bass", "Brown Trout"], cost: "Free (License Required)", description: "New Mexico's premier cold-water fishery at 7,186 feet elevation. A no-wake lake offering peaceful fishing for kokanee salmon and trophy trout in a stunning mountain setting.", bestSeason: "Summer & Fall", fishingTips: ["Troll for kokanee with dodger and fly combos in summer", "Fish deep for lake trout with large spoons near the dam", "Shore fish for stocked rainbow trout with PowerBait", "The no-wake rule makes this perfect for kayak fishing"] },

  // NORTH DAKOTA
  { id: 164, name: "Garrison Dam Tailrace", type: "dam", state: "North Dakota", address: "Garrison Dam, Riverdale, ND 58565", fish: ["Walleye", "Northern Pike", "Chinook Salmon", "Rainbow Trout", "Sauger", "Catfish"], cost: "Free (License Required)", description: "One of the most productive tailwater fisheries in the northern plains. The cold, oxygen-rich water below Garrison Dam supports incredible walleye and salmon fishing year-round.", bestSeason: "Spring & Fall", fishingTips: ["Fish jigs tipped with minnows for walleye near the discharge", "Target chinook salmon with spoons in the fast water", "The bank fishing access is excellent on both sides", "Winter fishing for walleye below the dam is outstanding"] },

  // RHODE ISLAND
  { id: 165, name: "Worden Pond", type: "lake", state: "Rhode Island", address: "Worden Pond, Wakefield, RI 02879", fish: ["Largemouth Bass", "Chain Pickerel", "Yellow Perch", "Bluegill", "Brown Bullhead"], cost: "Free (License Required)", description: "Rhode Island's largest freshwater body at 1,043 acres. A shallow, weedy lake that produces trophy largemouth bass and pickerel in a peaceful, undeveloped setting.", bestSeason: "Spring & Summer", fishingTips: ["Fish the weed edges for trophy largemouth with frogs and buzzbaits", "Target pickerel in the lily pads with spinnerbaits", "Use worms under a bobber for perch and bluegill", "Canoe or kayak access opens up the best fishing areas"] },

  // SOUTH DAKOTA
  { id: 166, name: "Big Sioux River", type: "river", state: "South Dakota", address: "Big Sioux River, Sioux Falls, SD 57104", fish: ["Walleye", "Channel Catfish", "Smallmouth Bass", "Northern Pike", "Sauger"], cost: "Free (License Required)", description: "An underrated urban fishery flowing through Sioux Falls with excellent walleye and catfish. Falls Park provides a scenic backdrop for fishing in the heart of the city.", bestSeason: "Spring & Summer", fishingTips: ["Fish below the falls for walleye with jigs and minnows", "Target catfish in deep pools with cut bait", "Wade fish the riffles for smallmouth in summer", "The stretch through town has multiple public access points"] },

  // VERMONT
  { id: 167, name: "Lake Memphremagog", type: "lake", state: "Vermont", address: "Lake Memphremagog, Newport, VT 05855", fish: ["Landlocked Salmon", "Lake Trout", "Smallmouth Bass", "Walleye", "Brown Trout", "Northern Pike"], cost: "Free (License Required)", description: "A stunning international lake straddling the US-Canada border with excellent cold-water fishing. The deep, clear water produces trophy salmon and lake trout in a beautiful mountain setting.", bestSeason: "Spring & Summer", fishingTips: ["Troll for salmon with streamer flies in spring", "Fish the South Bay for walleye and pike", "Target smallmouth on rocky shoals with tube jigs", "The deep basin near the border produces trophy lakers"] },

  // WEST VIRGINIA
  { id: 168, name: "Stonewall Jackson Lake", type: "lake", state: "West Virginia", address: "Stonewall Jackson Lake State Park, Roanoke, WV 26423", fish: ["Largemouth Bass", "Channel Catfish", "Crappie", "Bluegill", "Muskie", "Walleye"], cost: "Free (License Required)", description: "A scenic 2,650-acre lake with a resort lodge, golf course, and excellent family fishing. The lake is managed for trophy bass and muskie with strict slot limits.", bestSeason: "Spring & Summer", fishingTips: ["Fish the standing timber for crappie with jigs and minnows", "Target bass along the shoreline with spinnerbaits in spring", "The upper arms have the best muskie habitat", "Rent a boat from the marina for best access to fishing spots"] },

  // WYOMING
  { id: 169, name: "Bighorn River", type: "river", state: "Wyoming", address: "Bighorn River, Thermopolis, WY 82443", fish: ["Rainbow Trout", "Brown Trout", "Walleye", "Sauger", "Channel Catfish"], cost: "Free (License Required)", description: "One of the finest tailwater trout fisheries in the world below Boysen Reservoir. The nutrient-rich water produces trout averaging 16-18 inches with fish over 20 inches common.", bestSeason: "Year-round", fishingTips: ["Fish scuds and sowbugs below the dam for trophy trout", "Use San Juan worms during high water for consistent action", "Float the Wedding of the Waters section for best access", "Dry fly fishing is excellent during summer caddis hatches"] },

  // ========================================
  // ADDITIONAL POPULAR & FAMILY SPOTS
  // ========================================

  // ARKANSAS
  { id: 170, name: "Beaver Lake", type: "lake", state: "Arkansas", address: "Beaver Lake, Rogers, AR 72756", fish: ["Largemouth Bass", "Spotted Bass", "Striped Bass", "Walleye", "Crappie", "Bluegill"], cost: "Free (License Required)", description: "Northwest Arkansas' premier lake in the heart of the Ozarks. Crystal-clear water, stunning bluffs, and excellent multi-species fishing make it a top family destination.", bestSeason: "Spring & Fall", fishingTips: ["Fish the bluffs for spotted bass with jerkbaits and drop shots", "Target stripers near the dam with live shad in summer", "The War Eagle Creek arm has the best crappie fishing", "Walleye fishing is excellent near the dam in winter"] },

  // KENTUCKY
  { id: 171, name: "Lake Cumberland", type: "lake", state: "Kentucky", address: "Lake Cumberland, Jamestown, KY 42629", fish: ["Striped Bass", "Largemouth Bass", "Smallmouth Bass", "Walleye", "Crappie", "Rainbow Trout"], cost: "Free (License Required)", description: "Kentucky's crown jewel lake with 1,255 miles of shoreline and trophy striped bass fishing. Houseboating and fishing combine for the ultimate family vacation.", bestSeason: "Spring & Summer", fishingTips: ["Target trophy stripers with live shad near the dam", "Fish rocky points for smallmouth with crawfish patterns", "The Wolf Creek Dam tailwater has excellent trout fishing", "Rent a houseboat and fish from it for a unique family experience"] },

  // TEXAS
  { id: 172, name: "Sam Rayburn Reservoir", type: "lake", state: "Texas", address: "Sam Rayburn Reservoir, Jasper, TX 75951", fish: ["Largemouth Bass", "Crappie", "Catfish", "Bluegill", "White Bass"], cost: "Free (License Required)", description: "The largest lake entirely within Texas at 114,500 acres. Known as a bass fishing paradise with massive hydrilla beds that produce trophy largemouth year after year.", bestSeason: "Spring", fishingTips: ["Fish the hydrilla edges with Texas-rigged worms for bass", "Target crappie in standing timber with minnows in spring", "The Angelina River arm has the best bass habitat", "Use Carolina rigs on main lake humps in summer"] },

  // NORTH CAROLINA
  { id: 173, name: "Jordan Lake", type: "lake", state: "North Carolina", address: "Jordan Lake, Apex, NC 27523", fish: ["Largemouth Bass", "Striped Bass", "Crappie", "Catfish", "Bluegill", "White Perch"], cost: "Free (License Required)", description: "The Triangle area's top fishing lake just minutes from Raleigh, Durham, and Chapel Hill. Multiple recreation areas with beaches, campgrounds, and excellent family fishing access.", bestSeason: "Spring & Fall", fishingTips: ["Fish the standing timber for crappie in spring with jigs", "Target stripers near the dam with live shad or umbrella rigs", "The Haw River arm has the best bass fishing", "Shore fish at Seaforth Beach Recreation Area for easy family access"] },

  // OKLAHOMA
  { id: 174, name: "Tenkiller Ferry Lake", type: "lake", state: "Oklahoma", address: "Lake Tenkiller, Vian, OK 74962", fish: ["Largemouth Bass", "Spotted Bass", "Striped Bass", "Walleye", "Crappie", "Catfish"], cost: "Free (License Required)", description: "Oklahoma's 'Clear Water Jewel' with stunning bluffs and excellent scuba-clear visibility. The deep, clear water produces trophy spotted bass and is a favorite for swimming and cliff jumping.", bestSeason: "Spring & Fall", fishingTips: ["Fish deep bluffs for spotted bass with drop shots and jerkbaits", "Target walleye near the dam with jigs at night", "The Illinois River arm has the best crappie fishing", "Use finesse techniques - the clear water demands light line"] },

  // GEORGIA
  { id: 175, name: "Lake Allatoona", type: "lake", state: "Georgia", address: "Lake Allatoona, Cartersville, GA 30121", fish: ["Spotted Bass", "Largemouth Bass", "Striped Bass", "Crappie", "Catfish", "Bluegill"], cost: "Free (License Required)", description: "Metro Atlanta's most accessible fishing lake with 12,010 acres just 30 minutes from downtown. Multiple Corps of Engineers parks provide free boat ramps and picnic areas.", bestSeason: "Spring & Fall", fishingTips: ["Fish the red clay points for spotted bass with crankbaits", "Target stripers near the dam with live herring in summer", "The Etowah River arm has the best crappie in spring", "Shore fish at Red Top Mountain State Park for family access"] },

  // ALABAMA
  { id: 176, name: "Coosa River - Lay Lake", type: "river", state: "Alabama", address: "Lay Lake, Columbiana, AL 35051", fish: ["Largemouth Bass", "Spotted Bass", "Crappie", "Striped Bass", "Catfish", "Bluegill"], cost: "Free (License Required)", description: "Part of the legendary Coosa River chain of lakes in central Alabama. Lay Lake offers excellent spotted bass fishing and is a popular tournament destination.", bestSeason: "Spring & Fall", fishingTips: ["Fish the river channel ledges for spotted bass with crankbaits", "Target crappie in brush piles near the bridges", "The Coosa River section above the lake has excellent wade fishing", "Use topwater in the backs of creeks for largemouth at dawn"] },

  // FLORIDA - Additional
  { id: 177, name: "Everglades National Park", type: "ocean", state: "Florida", address: "Flamingo, Everglades National Park, FL 33034", fish: ["Snook", "Tarpon", "Red Drum", "Speckled Trout", "Mangrove Snapper", "Largemouth Bass"], cost: "National Park Fee ($30/vehicle)", description: "America's premier backcountry fishing destination with both freshwater and saltwater species in a unique mangrove wilderness. Snook and tarpon fishing here is world-class.", bestSeason: "Winter & Spring", fishingTips: ["Fish the mangrove shorelines for snook with live pilchards", "Target tarpon in the backcountry channels in spring", "The freshwater canals hold trophy largemouth bass", "Hire a guide for your first trip - navigation is complex"] },

  // MICHIGAN - Additional
  { id: 178, name: "Pere Marquette River", type: "river", state: "Michigan", address: "Pere Marquette River, Baldwin, MI 49304", fish: ["Steelhead", "Chinook Salmon", "Brown Trout", "Rainbow Trout", "Smallmouth Bass"], cost: "Free (License Required)", description: "Michigan's most famous fly-fishing-only river section with world-class steelhead and salmon runs. The crystal-clear water and scenic forest setting make it a bucket-list destination.", bestSeason: "Fall & Winter", fishingTips: ["Fish the flies-only section for wild brown trout with dry flies", "Target steelhead October through April with egg patterns", "Chinook salmon run in September - use large streamers", "Book a guided drift boat trip for the best experience"] },

  // PENNSYLVANIA - Additional
  { id: 179, name: "Raystown Lake", type: "lake", state: "Pennsylvania", address: "Raystown Lake, Huntingdon, PA 16652", fish: ["Striped Bass", "Largemouth Bass", "Smallmouth Bass", "Walleye", "Crappie", "Muskie"], cost: "Free (License Required)", description: "Pennsylvania's largest lake entirely within the state, set in the Appalachian Mountains. Known for trophy striped bass and excellent multi-species fishing with stunning fall foliage.", bestSeason: "Spring & Fall", fishingTips: ["Troll for stripers with umbrella rigs near the dam", "Fish rocky points for smallmouth with crawfish patterns", "Target walleye at night with jigs near the creek mouths", "The Entriken area has the best crappie fishing in spring"] },

  // LOUISIANA - Additional
  { id: 180, name: "Lake D'Arbonne", type: "lake", state: "Louisiana", address: "Lake D'Arbonne State Park, Farmerville, LA 71241", fish: ["Largemouth Bass", "Crappie", "Bluegill", "Channel Catfish", "Bowfin"], cost: "Free (License Required)", description: "A beautiful cypress-studded lake in northern Louisiana with outstanding crappie and bass fishing. The state park offers camping, cabins, and a fishing pier perfect for families.", bestSeason: "Spring", fishingTips: ["Fish the cypress trees for crappie with jigs and minnows", "Target bass in the flooded timber with spinnerbaits", "The state park pier is great for kids fishing for bluegill", "Use chicken liver for catfish near the dam at night"] },

  // MISSISSIPPI - Additional
  { id: 181, name: "Grenada Lake", type: "lake", state: "Mississippi", address: "Grenada Lake, Grenada, MS 38901", fish: ["Crappie", "Largemouth Bass", "Catfish", "White Bass", "Bluegill"], cost: "Free (License Required)", description: "Mississippi's crappie fishing capital, producing some of the largest crappie in the nation. The flooded timber provides perfect habitat for slabs over 2 lbs.", bestSeason: "Spring", fishingTips: ["Spider rig for crappie over brush piles with minnows", "Fish the standing timber for trophy crappie in March", "Target white bass at the Yalobusha River inlet in spring", "The south end has the best bass fishing near the grass"] },

  // MISSOURI - Additional
  { id: 182, name: "Stockton Lake", type: "lake", state: "Missouri", address: "Stockton Lake, Stockton, MO 65785", fish: ["Walleye", "Largemouth Bass", "Crappie", "Catfish", "Paddlefish", "White Bass"], cost: "Free (License Required)", description: "Missouri's walleye capital with crystal-clear Ozark water and excellent multi-species fishing. The 24,900-acre lake also offers outstanding paddlefish snagging below the dam.", bestSeason: "Spring & Fall", fishingTips: ["Troll for walleye with bottom bouncers and crawler harnesses", "Fish the clear water with finesse techniques for bass", "Snag for paddlefish below the dam in March-April", "The Big Sac arm has the best crappie fishing"] },

  // INDIANA - Additional
  { id: 183, name: "Monroe Lake", type: "lake", state: "Indiana", address: "Monroe Lake, Bloomington, IN 47401", fish: ["Largemouth Bass", "Crappie", "Bluegill", "Channel Catfish", "Walleye", "Muskie"], cost: "Free (License Required)", description: "Indiana's largest lake near Indiana University, offering excellent bass and crappie fishing. Paynetown State Recreation Area provides great family access with a beach and campground.", bestSeason: "Spring & Summer", fishingTips: ["Fish the standing timber for crappie with jigs in spring", "Target bass along the shoreline with spinnerbaits", "The Cutright area has the best walleye fishing", "Shore fish at Paynetown SRA for easy family access"] },

  // IOWA - Additional
  { id: 184, name: "Rathbun Lake", type: "lake", state: "Iowa", address: "Rathbun Lake, Centerville, IA 52544", fish: ["Walleye", "Channel Catfish", "Crappie", "Largemouth Bass", "White Bass", "Muskie"], cost: "Free (License Required)", description: "Iowa's top walleye lake and a hidden gem for muskie fishing. The 11,000-acre reservoir offers excellent fishing with a resort lodge and multiple campgrounds for families.", bestSeason: "Spring & Summer", fishingTips: ["Troll for walleye with crawler harnesses along the dam", "Target muskie in the upper arms with large jerkbaits", "Fish brush piles for crappie near the marina", "The Chariton River arm has the best catfish action"] },
];




export const states = [
  "All States", "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida",
  "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

export const waterTypes = [
  { value: "all", label: "All Water Types" },
  { value: "lake", label: "Lakes" },
  { value: "river", label: "Rivers" },
  { value: "ocean", label: "Oceans & Bays" },
  { value: "dam", label: "Dams" },
  { value: "private", label: "Private Waters" },
  { value: "pay-lake", label: "Pay Lakes" },
];

export interface SpotFilters {
  search?: string;
  state?: string;
  status?: string;
  accessType?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminSpot extends Record<string, unknown> {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  state: string;
  city: string | null;
  county: string | null;
  country: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  water_type: string;
  access_type: string | null;
  public_access: boolean;
  private_access: boolean;
  permit_required: boolean;
  permit_information: string | null;
  best_seasons: string | null;
  fishing_notes: string | null;
  image_url: string | null;
  website_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  fishing_spot_species?: Array<{ species: { id: string; name: string } | null }>;
}

export interface AdminSpecies {
  id: string;
  name: string;
  scientific_name: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  spot_count?: number;
}

export interface AdminAccommodation {
  id: number;
  spot_id: number;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  price_min: number | null;
  price_max: number | null;
  rating: number | null;
  description: string | null;
  amenities: string[] | null;
  website: string | null;
  distance_miles: number | null;
  fishing_spots?: { name: string } | null;
}

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
}

export interface MembershipCandidate {
  id: string;
  email: string | null;
  display_name: string | null;
  subscription: {
    id: string;
    status: string;
    plan: string;
    provider: string | null;
    current_period_end: string | null;
  } | null;
}

interface PublicSpeciesRow {
  id: string; name: string; scientific_name: string | null; category: string | null; subcategory: string | null;
  image_url: string | null; description: string | null; habitat: string | null; average_size: string | null;
  record_size: string | null; best_seasons: string[] | null; peak_season: string | null; recommended_bait: string[] | null;
  recommended_lures: string[] | null; techniques: string[] | null; difficulty: string | null; fun_fact: string | null; conservation: string | null;
}

const throwIfError = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
  return data;
};

export async function isCurrentUserAdmin(userId: string) {
 try {
     const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', userId).single();
     if (error) throw new Error(error.message);
     return !!data;
 } catch (e) {
   console.error(e);
   return false;
 }
}

export async function getPublicFishingSpots(): Promise<FishingSpot[]> {
  const { data, error } = await supabase.from('fishing_spots').select('*').eq('status', 'active').order('created_at', { ascending: true });
  const rows = throwIfError({ data: data as AdminSpot[] | null, error });
  const spotIds = (rows || []).map((spot) => spot.id);
  const { data: relations, error: relationError } = spotIds.length
    ? await supabase.from('fishing_spot_species').select('fishing_spot_id, species_id').in('fishing_spot_id', spotIds)
    : { data: [], error: null };
  if (relationError) throw new Error(relationError.message);
  const speciesIds = (relations || []).map((relation) => relation.species_id);
  const { data: speciesRows, error: speciesError } = speciesIds.length
    ? await supabase.from('fishing_species').select('id, name').in('id', speciesIds)
    : { data: [], error: null };
  if (speciesError) throw new Error(speciesError.message);
  const speciesById = new Map((speciesRows || []).map((species) => [species.id, species.name]));
  const speciesBySpot = new Map<number, string[]>();
  (relations || []).forEach((relation) => {
    const name = speciesById.get(relation.species_id);
    if (name) speciesBySpot.set(relation.fishing_spot_id, [...(speciesBySpot.get(relation.fishing_spot_id) || []), name]);
  });
  return (rows || []).map((spot) => ({
    id: spot.id,
    name: spot.name,
    type: spot.water_type as FishingSpot['type'],
    state: spot.state,
    address: spot.address || [spot.city, spot.state].filter(Boolean).join(', '),
    fish: speciesBySpot.get(spot.id) || [],
    cost: spot.permit_information || (spot.permit_required ? 'Permit required' : 'Free'),
    description: spot.description || '',
    bestSeason: spot.best_seasons || 'Year-round',
    fishingTips: (spot.fishing_notes || '').split('\n').filter(Boolean),
    latitude: spot.latitude,
    longitude: spot.longitude,
  }));
}

export async function getAdminSpots(filters: SpotFilters = {}) {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  let query = supabase.from('fishing_spots').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (filters.search) query = query.or(`name.ilike.%${filters.search}%,city.ilike.%${filters.search}%,state.ilike.%${filters.search}%`);
  if (filters.state && filters.state !== 'all') query = query.eq('state', filters.state);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.accessType && filters.accessType !== 'all') query = query.eq('access_type', filters.accessType);
  const { data, error, count } = await query.order('updated_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(error.message);
  const spots = (data || []) as AdminSpot[];
  const ids = spots.map((spot) => spot.id);
  if (!ids.length) return { data: spots, count: count || 0 };
  const { data: relations, error: relationError } = await supabase.from('fishing_spot_species').select('fishing_spot_id, species_id').in('fishing_spot_id', ids);
  if (relationError) throw new Error(relationError.message);
  return { data: spots.map((spot) => ({ ...spot, fishing_spot_species: (relations || []).filter((relation) => relation.fishing_spot_id === spot.id).map((relation) => ({ species: { id: relation.species_id, name: '' } })) })), count: count || 0 };
}

export async function getAdminSpotOptions() {
  const { data, error } = await supabase
    .from('fishing_spots')
    .select('id, name, state, city')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getAdminStats() {
  const [spots, active, species] = await Promise.all([
    supabase.from('fishing_spots').select('*', { count: 'exact', head: true }),
    supabase.from('fishing_spots').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('fishing_species').select('*', { count: 'exact', head: true }),
  ]);
  const errors = [spots, active, species].find((result) => result.error);
  if (errors?.error) throw new Error(errors.error.message);
  return { spots: spots.count || 0, activeSpots: active.count || 0, species: species.count || 0 };
}

export async function getAdminSpecies() {
  const { data, error } = await supabase.from('fishing_species').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const { data: relations, error: relationError } = await supabase.from('fishing_spot_species').select('species_id');
  if (relationError) throw new Error(relationError.message);
  return (data || []).map((item: AdminSpecies) => ({ ...item, spot_count: (relations || []).filter((relation) => relation.species_id === item.id).length }));
}

export async function getAdminAccommodations() {
  const { data, error } = await supabase
    .from('accommodations')
    .select('*')
    .order('created_at', { ascending: false });;
  console.log("Accommodations fetched:", data);
  if (error) throw new Error(error.message);
  const accommodations = (data || []) as AdminAccommodation[];
  const spotIds = [...new Set(accommodations.map((item) => item.spot_id))];
  if (!spotIds.length) return accommodations;
  const { data: spots, error: spotError } = await supabase
    .from('fishing_spots')
    .select('id, name')
    .in('id', spotIds);
  if (spotError) throw new Error(spotError.message);
  const names = new Map((spots || []).map((spot) => [spot.id, spot.name]));
  return accommodations.map((item) => ({
    ...item,
    fishing_spots: { name: names.get(item.spot_id) || 'Unknown spot' },
  }));
}

export async function getAdminUsers() {
  const [{ data: profiles, error: profilesError }, { data: admins, error: adminsError }] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name').order('email'),
    supabase.from('admins').select('user_id'),
  ]);
  if (profilesError) throw new Error(profilesError.message);
  if (adminsError) throw new Error(adminsError.message);
  const adminIds = new Set((admins || []).map((admin) => admin.user_id));
  return (profiles || []).map((profile) => ({ ...profile, is_admin: adminIds.has(profile.id) })) as AdminUser[];
}

export async function setAdminStatus(userId: string, isAdmin: boolean) {
  if (isAdmin) {
    const { error } = await supabase.from('admins').upsert({ user_id: userId }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('admins').delete().eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}

export async function getPublicSpecies(): Promise<FishSpecies[]> {
  const { data, error } = await supabase.from('fishing_species').select('*').eq('is_active', true).order('name');
  if (error) throw new Error(error.message);
  return (data as PublicSpeciesRow[] || []).map((item) => ({
    id: item.id, name: item.name, scientificName: item.scientific_name || '', category: item.category || 'freshwater',
    subcategory: item.subcategory || '', image: item.image_url || '', description: item.description || '', habitat: item.habitat || '',
    averageSize: item.average_size || '', recordSize: item.record_size || '', bestSeasons: item.best_seasons || [], peakSeason: item.peak_season || '',
    recommendedBait: item.recommended_bait || [], recommendedLures: item.recommended_lures || [], techniques: item.techniques || [],
    difficulty: item.difficulty || 'Beginner', funFact: item.fun_fact || '', conservation: item.conservation || '',
  })) as FishSpecies[];
}

export async function saveAdminRecord(table: string, values: Record<string, unknown>, id?: string | number) {
  const query = id === undefined ? supabase.from(table).insert(values) : supabase.from(table).update(values).eq('id', id);
  const { data, error } = await query.select().single();
  return throwIfError({ data, error });
}

export async function getNextFishingSpotId() {
  const { data, error } = await supabase
    .from('fishing_spots')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.id !== undefined && typeof data.id !== 'number') {
    throw new Error('Database mismatch: fishing_spots.id must be integer because the application uses numeric spot IDs.');
  }
  const nextId = (data?.id || 0) + 1;
  if (!Number.isSafeInteger(nextId)) throw new Error('Unable to allocate a fishing spot ID.');
  return nextId;
}

export async function deleteAdminRecord(table: string, id: string | number) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function replaceSpotRelations(spotId: number, speciesIds: string[], checklistIds: string[]) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const invalidSpeciesId = speciesIds.find((id) => !uuidPattern.test(String(id)));
  if (invalidSpeciesId) {
    throw new Error(`Species ID "${invalidSpeciesId}" is not a UUID. Run the database ID migration before assigning species.`);
  }
  const invalidChecklistId = checklistIds.find((id) => !uuidPattern.test(String(id)));
  if (invalidChecklistId) {
    throw new Error(`Checklist ID "${invalidChecklistId}" is not a UUID. Run the database ID migration before assigning checklist items.`);
  }
  const speciesDelete = await supabase.from('fishing_spot_species').delete().eq('fishing_spot_id', spotId);
  if (speciesDelete.error) throw new Error(speciesDelete.error.message);
  if (speciesIds.length) {
    const { error } = await supabase.from('fishing_spot_species').insert(speciesIds.map((species_id) => ({ fishing_spot_id: spotId, species_id })));
    if (error) throw new Error(error.message);
  }
}

export function isSubscriptionEntitled(subscription: SubscriptionPeriod | null | undefined): boolean {
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return false;
  }

  if (!subscription.current_period_end) return true;

  const periodEnd = Date.parse(subscription.current_period_end);
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

const PRO_ACCESS_CACHE_TTL = 10 * 60 * 1000;
const proAccessCache = new Map<string, { hasAccess: boolean; checkedAt: number }>();
const proAccessChecks = new Map<string, Promise<boolean>>();

export async function getCachedUserProAccess(userId: string): Promise<boolean> {
  const cached = proAccessCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < PRO_ACCESS_CACHE_TTL) {
    return cached.hasAccess;
  }

  let check = proAccessChecks.get(userId);
  if (!check) {
    check = (async () => {
      await expireUserSubscriptions(userId);
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing']);
      if (error) throw new Error(error.message);
      return (data || []).some(isSubscriptionEntitled);
    })();
    proAccessChecks.set(userId, check);
  }

  try {
    const hasAccess = await check;
    proAccessCache.set(userId, { hasAccess, checkedAt: Date.now() });
    return hasAccess;
  } finally {
    if (proAccessChecks.get(userId) === check) proAccessChecks.delete(userId);
  }
}

export async function getMembershipUsers(): Promise<MembershipCandidate[]> {
  const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name').order('email'),
    supabase
      .from('subscriptions')
      .select('id, user_id, status, plan, provider, current_period_end, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);
  if (profilesError) throw new Error(profilesError.message);
  if (subscriptionsError) throw new Error(subscriptionsError.message);

  const latestSubscriptionByUser = new Map<string, MembershipCandidate['subscription']>();
  for (const subscription of subscriptions || []) {
    if (!latestSubscriptionByUser.has(subscription.user_id)) {
      latestSubscriptionByUser.set(subscription.user_id, {
        id: subscription.id,
        status: subscription.status,
        plan: subscription.plan,
        provider: subscription.provider,
        current_period_end: subscription.current_period_end,
      });
    }
  }

  return (profiles || []).map((profile) => ({
    ...profile,
    subscription: latestSubscriptionByUser.get(profile.id) || null,
  }));
}

export async function cancelAdminMembership(subscriptionId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      status: 'inactive',
      plan: 'free',
      current_period_end: now,
      updated_at: now,
    })
    .eq('id', subscriptionId)
    .eq('provider', 'admin')
    .in('status', ['active', 'trialing'])
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('This is not an active admin-granted subscription or it has already been cancelled.');
}

export async function grantAdminMembership(userId: string, durationDays: number): Promise<void> {
  if (!Number.isSafeInteger(durationDays) || durationDays < 1) {
    throw new Error('Duration must be a positive whole number of days.');
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('subscriptions')
    .select('id, status, current_period_end, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (subscriptionsError) throw new Error(subscriptionsError.message);
  if ((subscriptions || []).some(isSubscriptionEntitled)) {
    throw new Error('This user already has an active subscription.');
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const latestSubscription = subscriptions?.[0];
  const subscriptionValues = {
    status: 'active',
    plan: 'pro',
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    stripe_subscription_id: null,
    provider: 'admin',
    product_id: null,
    purchase_token: null,
    platform: null,
    auto_renewing: false,
    raw_receipt: null,
    updated_at: now.toISOString(),
  };

  if (latestSubscription) {
    const { data, error } = await supabase
      .from('subscriptions')
      .update(subscriptionValues)
      .eq('id', latestSubscription.id)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Subscription update was not allowed or the record no longer exists.');
    return;
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({ user_id: userId, ...subscriptionValues })
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Subscription insert was not allowed.');
}

const expiryUpdateAttempts = new Set<string>();

export async function expireUserSubscriptions(userId: string): Promise<void> {
  const now = new Date();
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .not('current_period_end', 'is', null)
    .lte('current_period_end', now.toISOString());
  if (subscriptionsError) throw new Error(subscriptionsError.message);

  for (const subscription of subscriptions || []) {
    if (expiryUpdateAttempts.has(subscription.id)) continue;
    expiryUpdateAttempts.add(subscription.id);

    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'inactive', plan: 'free', updated_at: now.toISOString() })
      .eq('id', subscription.id)
      .in('status', ['active', 'trialing']);
    if (error) {
      expiryUpdateAttempts.delete(subscription.id);
      throw new Error(error.message);
    }
  }
}


