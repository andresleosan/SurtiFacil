export interface PresetColombianProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  price_cents: number;
  last_cost_cents: number;
  unit: string;
  barcode: string;
  image_url: string;
  en_oferta?: boolean;
  precio_oferta_cents?: number | null;
  description: string;
}

export const COLOMBIAN_PRODUCT_CATALOG: PresetColombianProduct[] = [
  {
    id: 'prod-leche-alqueria-1l',
    name: 'Leche Entera Alquería 1L',
    brand: 'Alquería',
    category: 'Lácteos y Huevos',
    price_cents: 450000,
    last_cost_cents: 340000,
    unit: 'litro',
    barcode: '7702177001234',
    image_url: '/images/products/leche-alqueria-1l.svg',
    en_oferta: true,
    precio_oferta_cents: 420000,
    description: 'Leche entera ultrapasteurizada UHT en bolsa de 1 litro.',
  },
  {
    id: 'prod-arroz-diana-1lb',
    name: 'Arroz Diana 500g (1 Libra)',
    brand: 'Diana',
    category: 'Granos y Abarrotes',
    price_cents: 280000,
    last_cost_cents: 210000,
    unit: 'libra',
    barcode: '7702001012345',
    image_url: '/images/products/arroz-diana-1lb.svg',
    en_oferta: false,
    description: 'Arroz blanco seleccionado de primera, rinde más y no se pega.',
  },
  {
    id: 'prod-huevos-aa-x30',
    name: 'Cubeta de Huevos AA x30',
    brand: 'Granja Paisa',
    category: 'Lácteos y Huevos',
    price_cents: 1850000,
    last_cost_cents: 1450000,
    unit: 'cubeta',
    barcode: '7709990003030',
    image_url: '/images/products/huevos-aa-x30.svg',
    en_oferta: true,
    precio_oferta_cents: 1750000,
    description: 'Cubeta de 30 huevos rojos campesinos tamaño AA frescos.',
  },
  {
    id: 'prod-chocolate-corona-500g',
    name: 'Chocolate Corona 500g',
    brand: 'Corona',
    category: 'Despensa y Café',
    price_cents: 890000,
    last_cost_cents: 690000,
    unit: 'libra',
    barcode: '7702004005009',
    image_url: '/images/products/chocolate-corona-500g.svg',
    en_oferta: false,
    description: 'Pastillas tradicionales para preparar chocolate caliente espumoso.',
  },
  {
    id: 'prod-arepas-antioquenas-x10',
    name: 'Arepas Antioqueñas de Maíz x10',
    brand: 'Don Maíz',
    category: 'Panadería y Arepa',
    price_cents: 420000,
    last_cost_cents: 290000,
    unit: 'paquete',
    barcode: '7708881112223',
    image_url: '/images/products/arepas-antioquenas-x10.svg',
    en_oferta: false,
    description: 'Paquete de 10 arepas de tela de puro maíz peto antioqueño.',
  },
  {
    id: 'prod-quesito-antioqueno-400g',
    name: 'Quesito Antioqueño Colanta 400g',
    brand: 'Colanta',
    category: 'Lácteos y Huevos',
    price_cents: 980000,
    last_cost_cents: 760000,
    unit: 'unidad',
    barcode: '7702123456789',
    image_url: '/images/products/quesito-antioqueno-400g.svg',
    en_oferta: false,
    description: 'Quesito fresco y suave tradicional paisa, ideal con arepa y chocolate.',
  },
  {
    id: 'prod-aceite-gourmet-1l',
    name: 'Aceite Gourmet Familia 1L',
    brand: 'Gourmet',
    category: 'Granos y Abarrotes',
    price_cents: 1250000,
    last_cost_cents: 980000,
    unit: 'litro',
    barcode: '7702020304050',
    image_url: '/images/products/aceite-gourmet-1l.svg',
    en_oferta: false,
    description: 'Aceite vegetal refinado cero colesterol para cocina diaria.',
  },
  {
    id: 'prod-cocacola-15l',
    name: 'Coca-Cola Original 1.5L',
    brand: 'Coca-Cola',
    category: 'Bebidas y Licores',
    price_cents: 650000,
    last_cost_cents: 480000,
    unit: 'litro',
    barcode: '7702535001505',
    image_url: '/images/products/cocacola-15l.svg',
    en_oferta: false,
    description: 'Gaseosa sabor original en botella de 1.5 litros para compartir.',
  },
  {
    id: 'prod-frijol-cargamanto-1lb',
    name: 'Fríjol Cargamanto Rojo 500g',
    brand: 'La Granja',
    category: 'Granos y Abarrotes',
    price_cents: 520000,
    last_cost_cents: 390000,
    unit: 'libra',
    barcode: '7703332221110',
    image_url: '/images/products/frijol-cargamanto-1lb.svg',
    en_oferta: false,
    description: 'Fríjol cargamanto rojo tradicional de cosecha colombiana para bandeja paisa.',
  },
  {
    id: 'prod-cafe-sello-rojo-500g',
    name: 'Café Sello Rojo 500g',
    brand: 'Sello Rojo',
    category: 'Despensa y Café',
    price_cents: 1480000,
    last_cost_cents: 1180000,
    unit: 'libra',
    barcode: '7702004001230',
    image_url: '/images/products/cafe-sello-rojo-500g.svg',
    en_oferta: true,
    precio_oferta_cents: 1390000,
    description: 'Café tostado y molido 100% colombiano, el café tradicional del hogar.',
  },
  {
    id: 'prod-panela-pastilla-unidad',
    name: 'Panela en Pastilla 500g',
    brand: 'Trapiche Real',
    category: 'Despensa y Café',
    price_cents: 320000,
    last_cost_cents: 220000,
    unit: 'unidad',
    barcode: '7705554443332',
    image_url: '/images/products/panela-pastilla-unidad.svg',
    en_oferta: false,
    description: 'Panela criolla natural 100% jugo de caña de trapiche antioqueño.',
  },
  {
    id: 'prod-jabon-rey-unidad',
    name: 'Jabón Rey Barra 300g',
    brand: 'Rey',
    category: 'Aseo y Hogar',
    price_cents: 290000,
    last_cost_cents: 190000,
    unit: 'unidad',
    barcode: '7702008001114',
    image_url: '/images/products/jabon-rey-unidad.svg',
    en_oferta: false,
    description: 'Barra azul de jabón multiusos tradicional para lavar ropa y hogar.',
  },
  {
    id: 'prod-gaseosa-colombiana-15l',
    name: 'Gaseosa Colombiana Postobón 1.5L',
    brand: 'Postobón',
    category: 'Bebidas y Licores',
    price_cents: 580000,
    last_cost_cents: 420000,
    unit: 'litro',
    barcode: '7702535002229',
    image_url: '/images/products/gaseosa-colombiana-15l.svg',
    en_oferta: false,
    description: 'La nuestra, gaseosa sabor a kola de 1.5 litros.',
  },
  {
    id: 'prod-chocoramo-unidad',
    name: 'Chocoramo Ramo 65g',
    brand: 'Ramo',
    category: 'Snacks y Dulces',
    price_cents: 260000,
    last_cost_cents: 180000,
    unit: 'unidad',
    barcode: '7702009003335',
    image_url: '/images/products/chocoramo-unidad.svg',
    en_oferta: false,
    description: 'Ponqué tradicional cubierto de chocolate, el favorito de los colombianos.',
  },
  {
    id: 'prod-papas-margarita-pollo',
    name: 'Papas Margarita Pollo 105g',
    brand: 'Margarita',
    category: 'Snacks y Dulces',
    price_cents: 390000,
    last_cost_cents: 270000,
    unit: 'unidad',
    barcode: '7702010004448',
    image_url: '/images/products/papas-margarita-pollo.svg',
    en_oferta: false,
    description: 'Papas fritas crujientes con el inconfundible sabor a pollo.',
  },
];

/**
 * Busca inteligentemente una imagen del catálogo colombiano según el nombre o código de barras
 */
export function findColombianProductImage(name: string, barcode?: string): string | null {
  if (!name) return null;
  const normalizedName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (barcode) {
    const byBarcode = COLOMBIAN_PRODUCT_CATALOG.find((p) => p.barcode === barcode.trim());
    if (byBarcode) return byBarcode.image_url;
  }

  // Coincidencias por palabras clave colombianas
  if (normalizedName.includes('alqueria') || (normalizedName.includes('leche') && normalizedName.includes('entera'))) {
    return '/images/products/leche-alqueria-1l.svg';
  }
  if (normalizedName.includes('diana') || (normalizedName.includes('arroz') && (normalizedName.includes('blanco') || normalizedName.includes('libra')))) {
    return '/images/products/arroz-diana-1lb.svg';
  }
  if (normalizedName.includes('huevo') || normalizedName.includes('cubeta')) {
    return '/images/products/huevos-aa-x30.svg';
  }
  if (normalizedName.includes('corona') || normalizedName.includes('chocolate')) {
    return '/images/products/chocolate-corona-500g.svg';
  }
  if (normalizedName.includes('arepa')) {
    return '/images/products/arepas-antioquenas-x10.svg';
  }
  if (normalizedName.includes('quesito') || (normalizedName.includes('queso') && normalizedName.includes('colanta'))) {
    return '/images/products/quesito-antioqueno-400g.svg';
  }
  if (normalizedName.includes('aceite') || normalizedName.includes('gourmet')) {
    return '/images/products/aceite-gourmet-1l.svg';
  }
  if (normalizedName.includes('coca') || normalizedName.includes('cola')) {
    return '/images/products/cocacola-15l.svg';
  }
  if (normalizedName.includes('frijol') || normalizedName.includes('cargamanto')) {
    return '/images/products/frijol-cargamanto-1lb.svg';
  }
  if (normalizedName.includes('cafe') || normalizedName.includes('sello rojo')) {
    return '/images/products/cafe-sello-rojo-500g.svg';
  }
  if (normalizedName.includes('panela')) {
    return '/images/products/panela-pastilla-unidad.svg';
  }
  if (normalizedName.includes('jabon rey') || (normalizedName.includes('jabon') && normalizedName.includes('rey'))) {
    return '/images/products/jabon-rey-unidad.svg';
  }
  if (normalizedName.includes('colombiana') || (normalizedName.includes('postobon') && normalizedName.includes('kola'))) {
    return '/images/products/gaseosa-colombiana-15l.svg';
  }
  if (normalizedName.includes('chocoramo') || normalizedName.includes('ramo')) {
    return '/images/products/chocoramo-unidad.svg';
  }
  if (normalizedName.includes('margarita') || (normalizedName.includes('papa') && normalizedName.includes('pollo'))) {
    return '/images/products/papas-margarita-pollo.svg';
  }

  return null;
}
