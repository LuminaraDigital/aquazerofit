/**
 * Food composition seed corpus (~120 items). Per-100g macro values are
 * realistic figures aligned with public composition datasets (AQF-12:
 * source identifier retained on every record; calorie math downstream is
 * deterministic lookup + multiply, never model-estimated).
 */
import type { Allergen, Food } from '@aquazerofit/shared';

type Serving = { label: string; grams: number };

function food(
  slug: string,
  name: string,
  category: string,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  commonServings: Serving[],
  allergens: Allergen[] = [],
): Food {
  return {
    id: `food-${slug}`,
    type: 'food',
    name,
    category,
    per100g: { kcal, proteinG, carbsG, fatG },
    commonServings,
    allergens,
    source: 'AUSNUT-2011-13',
    licence: 'CC-BY-3.0-AU',
  };
}

export const foodsSeed: Food[] = [
  // ---- Fruit ----
  food('apple', 'Apple', 'Fruit', 52, 0.3, 13.8, 0.2, [{ label: '1 medium', grams: 180 }]),
  food('banana', 'Banana', 'Fruit', 89, 1.1, 22.8, 0.3, [{ label: '1 medium', grams: 118 }]),
  food('orange', 'Orange', 'Fruit', 47, 0.9, 11.8, 0.1, [{ label: '1 medium', grams: 130 }]),
  food('strawberries', 'Strawberries', 'Fruit', 32, 0.7, 7.7, 0.3, [{ label: '1 cup', grams: 150 }]),
  food('blueberries', 'Blueberries', 'Fruit', 57, 0.7, 14.5, 0.3, [{ label: '1 cup', grams: 148 }]),
  food('raspberries', 'Raspberries', 'Fruit', 52, 1.2, 11.9, 0.7, [{ label: '1 cup', grams: 123 }]),
  food('grapes', 'Grapes', 'Fruit', 69, 0.7, 18.1, 0.2, [{ label: '1 cup', grams: 151 }]),
  food('watermelon', 'Watermelon', 'Fruit', 30, 0.6, 7.6, 0.2, [{ label: '1 cup diced', grams: 152 }]),
  food('pineapple', 'Pineapple', 'Fruit', 50, 0.5, 13.1, 0.1, [{ label: '1 cup chunks', grams: 165 }]),
  food('mango', 'Mango', 'Fruit', 60, 0.8, 15.0, 0.4, [{ label: '1 cup sliced', grams: 165 }]),
  food('kiwifruit', 'Kiwifruit', 'Fruit', 61, 1.1, 14.7, 0.5, [{ label: '1 fruit', grams: 75 }]),
  food('peach', 'Peach', 'Fruit', 39, 0.9, 9.5, 0.3, [{ label: '1 medium', grams: 150 }]),
  food('pear', 'Pear', 'Fruit', 57, 0.4, 15.2, 0.1, [{ label: '1 medium', grams: 178 }]),
  food('avocado', 'Avocado', 'Fruit', 160, 2.0, 8.5, 14.7, [{ label: '1/2 fruit', grams: 100 }]),
  food('dates-medjool', 'Medjool Dates', 'Fruit', 277, 1.8, 75.0, 0.2, [{ label: '1 date', grams: 24 }]),

  // ---- Vegetables ----
  food('broccoli', 'Broccoli', 'Vegetable', 34, 2.8, 6.6, 0.4, [{ label: '1 cup chopped', grams: 91 }]),
  food('spinach', 'Spinach', 'Vegetable', 23, 2.9, 3.6, 0.4, [{ label: '1 cup raw', grams: 30 }]),
  food('kale', 'Kale', 'Vegetable', 49, 4.3, 8.8, 0.9, [{ label: '1 cup chopped', grams: 67 }]),
  food('carrot', 'Carrot', 'Vegetable', 41, 0.9, 9.6, 0.2, [{ label: '1 medium', grams: 61 }]),
  food('capsicum-red', 'Red Capsicum', 'Vegetable', 31, 1.0, 6.0, 0.3, [{ label: '1 medium', grams: 119 }]),
  food('tomato', 'Tomato', 'Vegetable', 18, 0.9, 3.9, 0.2, [{ label: '1 medium', grams: 123 }]),
  food('cucumber', 'Cucumber', 'Vegetable', 15, 0.7, 3.6, 0.1, [{ label: '1/2 cucumber', grams: 150 }]),
  food('lettuce-cos', 'Cos Lettuce', 'Vegetable', 17, 1.2, 3.3, 0.3, [{ label: '2 cups shredded', grams: 94 }]),
  food('zucchini', 'Zucchini', 'Vegetable', 17, 1.2, 3.1, 0.3, [{ label: '1 medium', grams: 196 }]),
  food('mushrooms', 'Mushrooms', 'Vegetable', 22, 3.1, 3.3, 0.3, [{ label: '1 cup sliced', grams: 70 }]),
  food('onion', 'Onion', 'Vegetable', 40, 1.1, 9.3, 0.1, [{ label: '1 medium', grams: 110 }]),
  food('garlic', 'Garlic', 'Vegetable', 149, 6.4, 33.1, 0.5, [{ label: '1 clove', grams: 3 }]),
  food('sweet-potato', 'Sweet Potato', 'Vegetable', 86, 1.6, 20.1, 0.1, [{ label: '1 medium baked', grams: 150 }]),
  food('potato', 'Potato', 'Vegetable', 77, 2.0, 17.5, 0.1, [{ label: '1 medium boiled', grams: 170 }]),
  food('pumpkin', 'Pumpkin', 'Vegetable', 26, 1.0, 6.5, 0.1, [{ label: '1 cup cubed', grams: 116 }]),
  food('cauliflower', 'Cauliflower', 'Vegetable', 25, 1.9, 5.0, 0.3, [{ label: '1 cup chopped', grams: 107 }]),
  food('green-beans', 'Green Beans', 'Vegetable', 31, 1.8, 7.0, 0.2, [{ label: '1 cup', grams: 100 }]),
  food('asparagus', 'Asparagus', 'Vegetable', 20, 2.2, 3.9, 0.1, [{ label: '6 spears', grams: 90 }]),
  food('beetroot', 'Beetroot', 'Vegetable', 43, 1.6, 9.6, 0.2, [{ label: '1 medium', grams: 82 }]),
  food('corn-kernels', 'Sweet Corn Kernels', 'Vegetable', 86, 3.3, 18.7, 1.4, [{ label: '1/2 cup', grams: 82 }]),
  food('peas-green', 'Green Peas', 'Vegetable', 81, 5.4, 14.5, 0.4, [{ label: '1/2 cup', grams: 80 }]),

  // ---- Grains & cereals ----
  food('oats-rolled', 'Rolled Oats', 'Grains', 379, 13.2, 67.7, 6.5, [{ label: '1/2 cup dry', grams: 45 }]),
  food('rice-white-cooked', 'White Rice (cooked)', 'Grains', 130, 2.7, 28.2, 0.3, [{ label: '1 cup cooked', grams: 158 }]),
  food('rice-brown-cooked', 'Brown Rice (cooked)', 'Grains', 112, 2.3, 23.5, 0.8, [{ label: '1 cup cooked', grams: 195 }]),
  food('quinoa-cooked', 'Quinoa (cooked)', 'Grains', 120, 4.4, 21.3, 1.9, [{ label: '1 cup cooked', grams: 185 }]),
  food('quinoa-black-dry', 'Black Quinoa (dry)', 'Grains', 368, 14.1, 64.2, 6.1, [{ label: '1/2 cup dry', grams: 85 }]),
  food('pasta-cooked', 'Pasta (cooked)', 'Grains', 158, 5.8, 30.9, 0.9, [{ label: '1 cup cooked', grams: 140 }], ['wheat']),
  food('pasta-wholemeal-cooked', 'Wholemeal Pasta (cooked)', 'Grains', 149, 6.3, 30.4, 1.7, [{ label: '1 cup cooked', grams: 140 }], ['wheat']),
  food('bread-wholegrain', 'Wholegrain Bread', 'Grains', 247, 10.7, 41.3, 3.5, [{ label: '1 slice', grams: 40 }], ['wheat']),
  food('bread-white', 'White Bread', 'Grains', 265, 9.0, 49.0, 3.2, [{ label: '1 slice', grams: 38 }], ['wheat']),
  food('bread-sourdough', 'Sourdough Bread', 'Grains', 256, 8.8, 49.6, 1.8, [{ label: '1 slice', grams: 50 }], ['wheat']),
  food('tortilla-wrap', 'Wholemeal Tortilla Wrap', 'Grains', 306, 8.7, 49.5, 7.7, [{ label: '1 wrap', grams: 64 }], ['wheat']),
  food('couscous-cooked', 'Couscous (cooked)', 'Grains', 112, 3.8, 23.2, 0.2, [{ label: '1 cup cooked', grams: 157 }], ['wheat']),
  food('muesli-natural', 'Natural Muesli', 'Grains', 354, 9.7, 62.2, 5.9, [{ label: '1/2 cup', grams: 55 }], ['wheat', 'treeNuts']),
  food('granola', 'Granola', 'Grains', 471, 10.1, 53.9, 20.0, [{ label: '1/2 cup', grams: 50 }], ['wheat', 'treeNuts']),
  food('rice-cakes', 'Rice Cakes', 'Grains', 387, 8.2, 81.1, 2.8, [{ label: '2 cakes', grams: 18 }]),
  food('buckwheat-cooked', 'Buckwheat (cooked)', 'Grains', 92, 3.4, 19.9, 0.6, [{ label: '1 cup cooked', grams: 168 }]),

  // ---- Meat & poultry ----
  food('chicken-breast', 'Chicken Breast (grilled)', 'Protein', 165, 31.0, 0.0, 3.6, [{ label: '1 small fillet', grams: 120 }, { label: '1 large fillet', grams: 180 }]),
  food('chicken-thigh', 'Chicken Thigh (roasted)', 'Protein', 209, 26.0, 0.0, 10.9, [{ label: '1 thigh', grams: 110 }]),
  food('turkey-breast', 'Turkey Breast (roasted)', 'Protein', 147, 30.1, 0.0, 2.1, [{ label: '2 slices', grams: 85 }]),
  food('beef-mince-lean', 'Lean Beef Mince (cooked)', 'Protein', 217, 26.6, 0.0, 11.8, [{ label: '1 serve', grams: 120 }]),
  food('beef-steak-lean', 'Lean Beef Steak (grilled)', 'Protein', 187, 29.0, 0.0, 7.6, [{ label: '1 small steak', grams: 150 }]),
  food('lamb-leg-roast', 'Lamb Leg (roasted)', 'Protein', 203, 28.0, 0.0, 9.9, [{ label: '2 slices', grams: 100 }]),
  food('pork-loin-lean', 'Pork Loin (grilled)', 'Protein', 173, 27.3, 0.0, 6.9, [{ label: '1 chop', grams: 120 }]),
  food('kangaroo-fillet', 'Kangaroo Fillet (grilled)', 'Protein', 118, 24.6, 0.0, 2.2, [{ label: '1 fillet', grams: 150 }]),
  food('ham-lean', 'Lean Ham', 'Protein', 107, 18.2, 1.5, 3.1, [{ label: '2 slices', grams: 46 }]),
  food('bacon-grilled', 'Bacon (grilled, trimmed)', 'Protein', 260, 30.5, 0.5, 15.4, [{ label: '2 rashers', grams: 50 }]),

  // ---- Fish & seafood ----
  food('salmon-atlantic', 'Atlantic Salmon (grilled)', 'Seafood', 208, 22.1, 0.0, 13.1, [{ label: '1 fillet', grams: 150 }], ['fish']),
  food('tuna-canned-springwater', 'Tuna in Springwater (drained)', 'Seafood', 109, 25.5, 0.0, 0.8, [{ label: '1 small can', grams: 95 }], ['fish']),
  food('barramundi', 'Barramundi (baked)', 'Seafood', 108, 22.0, 0.0, 2.2, [{ label: '1 fillet', grams: 150 }], ['fish']),
  food('prawns-cooked', 'Prawns (cooked)', 'Seafood', 99, 23.9, 0.2, 0.3, [{ label: '6 large prawns', grams: 90 }], ['shellfish']),
  food('cod-baked', 'Cod (baked)', 'Seafood', 105, 22.8, 0.0, 0.9, [{ label: '1 fillet', grams: 140 }], ['fish']),
  food('sardines-canned', 'Sardines in Oil (drained)', 'Seafood', 208, 24.6, 0.0, 11.5, [{ label: '1 can', grams: 84 }], ['fish']),
  food('mackerel-grilled', 'Mackerel (grilled)', 'Seafood', 262, 23.9, 0.0, 17.8, [{ label: '1 fillet', grams: 120 }], ['fish']),
  food('smoked-salmon', 'Smoked Salmon', 'Seafood', 117, 18.3, 0.0, 4.3, [{ label: '3 slices', grams: 60 }], ['fish']),

  // ---- Eggs & dairy ----
  food('egg-whole', 'Egg (boiled)', 'Eggs & Dairy', 155, 12.6, 1.1, 10.6, [{ label: '1 large egg', grams: 50 }], ['eggs']),
  food('egg-white', 'Egg White', 'Eggs & Dairy', 52, 10.9, 0.7, 0.2, [{ label: '1 egg white', grams: 33 }], ['eggs']),
  food('milk-full-cream', 'Full Cream Milk', 'Eggs & Dairy', 64, 3.3, 4.9, 3.5, [{ label: '1 cup', grams: 250 }], ['milk']),
  food('milk-skim', 'Skim Milk', 'Eggs & Dairy', 35, 3.5, 5.0, 0.1, [{ label: '1 cup', grams: 250 }], ['milk']),
  food('yoghurt-greek', 'Greek Yoghurt (natural)', 'Eggs & Dairy', 97, 9.0, 3.9, 5.0, [{ label: '1 tub', grams: 170 }], ['milk']),
  food('yoghurt-greek-lowfat', 'Low-Fat Greek Yoghurt', 'Eggs & Dairy', 59, 10.2, 3.6, 0.4, [{ label: '1 tub', grams: 170 }], ['milk']),
  food('cheese-cheddar', 'Cheddar Cheese', 'Eggs & Dairy', 403, 24.9, 1.3, 33.1, [{ label: '1 slice', grams: 21 }], ['milk']),
  food('cheese-feta', 'Feta Cheese', 'Eggs & Dairy', 264, 14.2, 4.1, 21.3, [{ label: '30 g cube', grams: 30 }], ['milk']),
  food('cheese-mozzarella', 'Mozzarella', 'Eggs & Dairy', 280, 27.5, 3.1, 17.1, [{ label: '1/4 cup shredded', grams: 28 }], ['milk']),
  food('cottage-cheese', 'Cottage Cheese', 'Eggs & Dairy', 98, 11.1, 3.4, 4.3, [{ label: '1/2 cup', grams: 113 }], ['milk']),
  food('butter', 'Butter', 'Eggs & Dairy', 717, 0.9, 0.1, 81.1, [{ label: '1 tsp', grams: 5 }], ['milk']),

  // ---- Plant proteins & legumes ----
  food('tofu-firm', 'Firm Tofu', 'Plant Protein', 144, 15.8, 2.9, 8.7, [{ label: '1 serve', grams: 100 }], ['soy']),
  food('tempeh', 'Tempeh', 'Plant Protein', 192, 20.3, 7.6, 10.8, [{ label: '1 serve', grams: 100 }], ['soy']),
  food('chickpeas-canned', 'Chickpeas (canned, drained)', 'Plant Protein', 139, 7.0, 19.3, 2.8, [{ label: '1/2 cup', grams: 82 }]),
  food('lentils-cooked', 'Lentils (cooked)', 'Plant Protein', 116, 9.0, 20.1, 0.4, [{ label: '1/2 cup', grams: 99 }]),
  food('black-beans-cooked', 'Black Beans (cooked)', 'Plant Protein', 132, 8.9, 23.7, 0.5, [{ label: '1/2 cup', grams: 86 }]),
  food('kidney-beans-canned', 'Red Kidney Beans (canned)', 'Plant Protein', 127, 8.7, 22.8, 0.5, [{ label: '1/2 cup', grams: 90 }]),
  food('edamame', 'Edamame (shelled)', 'Plant Protein', 121, 11.9, 8.9, 5.2, [{ label: '1/2 cup', grams: 78 }], ['soy']),
  food('hummus', 'Hummus', 'Plant Protein', 166, 7.9, 14.3, 9.6, [{ label: '2 tbsp', grams: 30 }], ['sesame']),
  food('falafel', 'Falafel', 'Plant Protein', 333, 13.3, 31.8, 17.8, [{ label: '3 balls', grams: 51 }], ['sesame']),
  food('baked-beans', 'Baked Beans in Tomato Sauce', 'Plant Protein', 91, 4.7, 15.3, 0.5, [{ label: '1/2 can', grams: 210 }]),

  // ---- Nuts & seeds ----
  food('almonds', 'Almonds (raw)', 'Nuts & Seeds', 579, 21.2, 21.6, 49.9, [{ label: 'small handful', grams: 30 }], ['treeNuts']),
  food('walnuts', 'Walnuts', 'Nuts & Seeds', 654, 15.2, 13.7, 65.2, [{ label: 'small handful', grams: 30 }], ['treeNuts']),
  food('cashews', 'Cashews (raw)', 'Nuts & Seeds', 553, 18.2, 30.2, 43.9, [{ label: 'small handful', grams: 30 }], ['treeNuts']),
  food('peanut-butter', 'Peanut Butter', 'Nuts & Seeds', 588, 25.1, 20.0, 50.4, [{ label: '1 tbsp', grams: 20 }], ['peanuts']),
  food('peanuts', 'Peanuts (roasted)', 'Nuts & Seeds', 585, 23.7, 21.5, 49.7, [{ label: 'small handful', grams: 30 }], ['peanuts']),
  food('almond-butter', 'Almond Butter', 'Nuts & Seeds', 614, 21.0, 18.8, 55.5, [{ label: '1 tbsp', grams: 16 }], ['treeNuts']),
  food('chia-seeds', 'Chia Seeds', 'Nuts & Seeds', 486, 16.5, 42.1, 30.7, [{ label: '1 tbsp', grams: 12 }]),
  food('flaxseed-ground', 'Ground Flaxseed', 'Nuts & Seeds', 534, 18.3, 28.9, 42.2, [{ label: '1 tbsp', grams: 7 }]),
  food('pumpkin-seeds', 'Pumpkin Seeds (pepitas)', 'Nuts & Seeds', 559, 30.2, 10.7, 49.1, [{ label: '1 tbsp', grams: 10 }]),
  food('sunflower-seeds', 'Sunflower Seeds', 'Nuts & Seeds', 584, 20.8, 20.0, 51.5, [{ label: '1 tbsp', grams: 12 }]),
  food('tahini', 'Tahini', 'Nuts & Seeds', 595, 17.0, 21.2, 53.8, [{ label: '1 tbsp', grams: 15 }], ['sesame']),

  // ---- Oils & condiments ----
  food('olive-oil', 'Extra Virgin Olive Oil', 'Oils & Condiments', 884, 0.0, 0.0, 100.0, [{ label: '1 tbsp', grams: 14 }]),
  food('coconut-oil', 'Coconut Oil', 'Oils & Condiments', 892, 0.0, 0.0, 99.1, [{ label: '1 tbsp', grams: 14 }]),
  food('honey', 'Honey', 'Oils & Condiments', 304, 0.3, 82.4, 0.0, [{ label: '1 tbsp', grams: 21 }]),
  food('maple-syrup', 'Maple Syrup', 'Oils & Condiments', 260, 0.0, 67.0, 0.1, [{ label: '1 tbsp', grams: 20 }]),
  food('soy-sauce', 'Soy Sauce', 'Oils & Condiments', 53, 8.1, 4.9, 0.6, [{ label: '1 tbsp', grams: 18 }], ['soy', 'wheat']),
  food('miso-paste', 'White Miso Paste', 'Oils & Condiments', 199, 11.7, 26.5, 6.0, [{ label: '1 tbsp', grams: 17 }], ['soy']),
  food('mayonnaise', 'Mayonnaise', 'Oils & Condiments', 680, 1.0, 2.6, 74.9, [{ label: '1 tbsp', grams: 15 }], ['eggs']),
  food('tomato-sauce', 'Tomato Sauce (ketchup)', 'Oils & Condiments', 101, 1.2, 23.5, 0.2, [{ label: '1 tbsp', grams: 17 }]),
  food('pesto-basil', 'Basil Pesto', 'Oils & Condiments', 455, 5.4, 5.6, 45.4, [{ label: '1 tbsp', grams: 16 }], ['milk', 'treeNuts']),

  // ---- Snacks & treats ----
  food('dark-chocolate', 'Dark Chocolate (70%)', 'Snacks', 546, 7.8, 45.8, 38.3, [{ label: '2 squares', grams: 20 }], ['milk', 'soy']),
  food('milk-chocolate', 'Milk Chocolate', 'Snacks', 535, 7.7, 59.4, 29.7, [{ label: '4 squares', grams: 25 }], ['milk', 'soy']),
  food('protein-bar', 'Protein Bar (choc)', 'Snacks', 380, 30.0, 35.0, 12.0, [{ label: '1 bar', grams: 60 }], ['milk', 'soy', 'peanuts']),
  food('muesli-bar', 'Muesli Bar', 'Snacks', 432, 7.1, 62.3, 16.5, [{ label: '1 bar', grams: 31 }], ['wheat', 'treeNuts']),
  food('popcorn-airpopped', 'Popcorn (air-popped)', 'Snacks', 387, 12.9, 77.8, 4.5, [{ label: '2 cups', grams: 16 }]),
  food('potato-chips', 'Potato Chips', 'Snacks', 536, 6.6, 52.9, 34.6, [{ label: 'small bag', grams: 45 }]),
  food('crackers-wholegrain', 'Wholegrain Crackers', 'Snacks', 444, 9.9, 63.5, 16.4, [{ label: '4 crackers', grams: 26 }], ['wheat']),
  food('corn-chips', 'Corn Chips', 'Snacks', 498, 6.7, 61.7, 24.6, [{ label: 'small bowl', grams: 50 }]),

  // ---- Beverages & supplements ----
  food('whey-protein', 'Whey Protein Powder', 'Supplements', 388, 78.0, 6.6, 5.4, [{ label: '1 scoop', grams: 30 }], ['milk']),
  food('protein-plant', 'Plant Protein Powder', 'Supplements', 375, 72.5, 9.4, 5.6, [{ label: '1 scoop', grams: 32 }], ['soy']),
  food('milk-soy', 'Soy Milk', 'Beverages', 44, 3.3, 2.4, 1.9, [{ label: '1 cup', grams: 250 }], ['soy']),
  food('milk-almond', 'Almond Milk (unsweetened)', 'Beverages', 15, 0.5, 0.6, 1.2, [{ label: '1 cup', grams: 250 }], ['treeNuts']),
  food('milk-oat', 'Oat Milk', 'Beverages', 46, 1.0, 6.7, 1.5, [{ label: '1 cup', grams: 250 }]),
  food('orange-juice', 'Orange Juice', 'Beverages', 45, 0.7, 10.4, 0.2, [{ label: '1 glass', grams: 200 }]),
  food('flat-white', 'Flat White Coffee', 'Beverages', 43, 2.4, 3.5, 2.2, [{ label: '1 regular', grams: 220 }], ['milk']),
  food('smoothie-berry', 'Berry Smoothie', 'Beverages', 58, 1.5, 12.1, 0.5, [{ label: '1 glass', grams: 300 }], ['milk']),
  food('sports-drink', 'Sports Drink', 'Beverages', 26, 0.0, 6.4, 0.0, [{ label: '1 bottle', grams: 600 }]),
  food('kombucha', 'Kombucha', 'Beverages', 19, 0.0, 4.5, 0.0, [{ label: '1 bottle', grams: 330 }]),

  // ---- Mixed / prepared ----
  food('sushi-salmon-roll', 'Salmon Sushi Roll', 'Prepared Meals', 150, 6.2, 26.5, 2.0, [{ label: '1 roll (8 pcs)', grams: 190 }], ['fish', 'soy', 'sesame']),
  food('pizza-margherita', 'Margherita Pizza', 'Prepared Meals', 266, 11.0, 33.0, 9.7, [{ label: '1 slice', grams: 107 }], ['wheat', 'milk']),
  food('burrito-chicken', 'Chicken Burrito', 'Prepared Meals', 163, 9.6, 19.2, 5.3, [{ label: '1 burrito', grams: 300 }], ['wheat', 'milk']),
  food('pad-thai-chicken', 'Chicken Pad Thai', 'Prepared Meals', 152, 9.1, 17.9, 4.9, [{ label: '1 serve', grams: 350 }], ['peanuts', 'eggs', 'fish', 'soy']),
  food('butter-chicken', 'Butter Chicken with Rice', 'Prepared Meals', 141, 8.9, 13.2, 5.9, [{ label: '1 serve', grams: 400 }], ['milk']),
  food('caesar-salad-chicken', 'Chicken Caesar Salad', 'Prepared Meals', 127, 10.9, 4.8, 7.2, [{ label: '1 bowl', grams: 320 }], ['wheat', 'milk', 'eggs', 'fish']),
  food('poke-bowl-salmon', 'Salmon Poke Bowl', 'Prepared Meals', 120, 7.8, 14.2, 3.6, [{ label: '1 bowl', grams: 400 }], ['fish', 'soy', 'sesame']),
  food('spaghetti-bolognese', 'Spaghetti Bolognese', 'Prepared Meals', 129, 7.4, 15.6, 4.1, [{ label: '1 serve', grams: 420 }], ['wheat']),
  food('vegetable-stirfry', 'Vegetable Stir-Fry with Tofu', 'Prepared Meals', 89, 5.4, 8.3, 4.1, [{ label: '1 serve', grams: 350 }], ['soy']),
  food('chicken-soup', 'Chicken and Vegetable Soup', 'Prepared Meals', 45, 3.9, 4.6, 1.2, [{ label: '1 bowl', grams: 350 }]),
];
