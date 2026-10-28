export interface ChecklistTemplate {
  text: string;
  category: string;
}

export const defaultChecklistItems: ChecklistTemplate[] = [
  // Fishing Gear
  { text: 'Fishing rod(s) & reel(s)', category: 'Fishing Gear' },
  { text: 'Tackle box with lures & hooks', category: 'Fishing Gear' },
  { text: 'Extra fishing line', category: 'Fishing Gear' },
  { text: 'Bait (live or artificial)', category: 'Fishing Gear' },
  { text: 'Landing net', category: 'Fishing Gear' },
  { text: 'Needle-nose pliers', category: 'Fishing Gear' },
  { text: 'Fillet knife', category: 'Fishing Gear' },
  { text: 'Stringer or fish basket', category: 'Fishing Gear' },
  { text: 'Bobbers & sinkers', category: 'Fishing Gear' },

  // Safety & Protection
  { text: 'Sunscreen (SPF 50+)', category: 'Safety' },
  { text: 'Bug spray / insect repellent', category: 'Safety' },
  { text: 'First aid kit', category: 'Safety' },
  { text: 'Polarized sunglasses', category: 'Safety' },
  { text: 'Hat or cap', category: 'Safety' },
  { text: 'Life jacket / PFD', category: 'Safety' },

  // Essentials
  { text: 'Valid fishing license', category: 'Essentials' },
  { text: 'Cooler with ice', category: 'Essentials' },
  { text: 'Drinking water & snacks', category: 'Essentials' },
  { text: 'Phone & charger / power bank', category: 'Essentials' },
  { text: 'Cash for bait shops / permits', category: 'Essentials' },
  { text: 'Maps / GPS / directions', category: 'Essentials' },

  // Clothing
  { text: 'Rain jacket / poncho', category: 'Clothing' },
  { text: 'Warm layers / fleece', category: 'Clothing' },
  { text: 'Waterproof boots / waders', category: 'Clothing' },
  { text: 'Extra change of clothes', category: 'Clothing' },
  { text: 'Gloves (sun or cold weather)', category: 'Clothing' },

  // Comfort & Extras
  { text: 'Folding chair / camp seat', category: 'Extras' },
  { text: 'Camera for trophy photos', category: 'Extras' },
  { text: 'Trash bags (leave no trace)', category: 'Extras' },
  { text: 'Towels / rags', category: 'Extras' },
  { text: 'Headlamp / flashlight', category: 'Extras' },
];

export const checklistCategories = ['Fishing Gear', 'Safety', 'Essentials', 'Clothing', 'Extras'];
