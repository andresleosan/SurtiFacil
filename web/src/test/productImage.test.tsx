import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductImage } from '../components/ui/ProductImage';
import {
  findColombianProductImage,
  COLOMBIAN_PRODUCT_CATALOG,
  DEFAULT_PRODUCT_IMAGE,
} from '../data/colombianCatalog';

describe('COLOMBIAN_PRODUCT_CATALOG & findColombianProductImage', () => {
  it('contiene productos emblemáticos colombianos con datos completos', () => {
    expect(COLOMBIAN_PRODUCT_CATALOG.length).toBeGreaterThanOrEqual(15);
    for (const item of COLOMBIAN_PRODUCT_CATALOG) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.price_cents).toBeGreaterThan(0);
      expect(item.image_url).toMatch(/^\/images\/products\/.+\.svg$/);
      expect(item.barcode).toMatch(/^770\d{10}$/);
    }
  });

  it('detecta empaques colombianos por nombre con matching difuso y normalización', () => {
    expect(findColombianProductImage('Arroz Diana de 1 libra')).toBe('/images/products/arroz-diana-1lb.svg');
    expect(findColombianProductImage('Leche Colanta Entera 1L')).toBe('/images/products/leche-colanta-1l.svg');
    expect(findColombianProductImage('Huevos Santa Reyes x30')).toBe('/images/products/huevos-santa-reyes.svg');
    expect(findColombianProductImage('Doña Panela 500g')).toBe('/images/products/panela-dona-panela.svg');
    expect(findColombianProductImage('Arepas de Chócolo')).toBe('/images/products/arepas-chocolo.svg');
    expect(findColombianProductImage('Salchichón Zenú')).toBe('/images/products/salchichon-zenu.svg');
    expect(findColombianProductImage('Galletas Saltín Noel')).toBe('/images/products/saltin-noel.svg');
    expect(findColombianProductImage('Aguacate Hass')).toBe('/images/products/aguacate-hass.svg');
    expect(findColombianProductImage('Quesito Colanta')).toBe('/images/products/quesito-antioqueno-400g.svg');
  });

  it('detecta empaque colombiano por código de barras EAN-13', () => {
    expect(findColombianProductImage('', '7702001012345')).toBe('/images/products/arroz-diana-1lb.svg');
    expect(findColombianProductImage('', '7702123000018')).toBe('/images/products/leche-colanta-1l.svg');
    expect(findColombianProductImage('', '7707221234567')).toBe('/images/products/huevos-santa-reyes.svg');
  });

  it('retorna null si el producto es desconocido y no tiene código', () => {
    expect(findColombianProductImage('Tornillo de acero inoxidable 2 pulgadas')).toBeNull();
    expect(findColombianProductImage('')).toBeNull();
  });
});

describe('<ProductImage /> Component', () => {
  it('renderiza con src explícito y atributos ergonómicos', () => {
    render(
      <ProductImage
        src="/images/products/arroz-diana-1lb.svg"
        alt="Arroz Diana 1kg"
        productName="Arroz Diana"
      />
    );

    const img = screen.getByRole('img', { name: 'Arroz Diana 1kg' }) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('/images/products/arroz-diana-1lb.svg');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('predice automáticamente la imagen si src no está presente', () => {
    render(
      <ProductImage
        alt="Leche Colanta"
        productName="Leche Colanta Entera 1L"
      />
    );

    const img = screen.getByRole('img', { name: 'Leche Colanta' }) as HTMLImageElement;
    expect(img.src).toContain('/images/products/leche-colanta-1l.svg');
  });

  it('usa DEFAULT_PRODUCT_IMAGE si no hay src ni predicción conocida', () => {
    render(
      <ProductImage
        alt="Producto Misterioso"
        productName="Producto Genérico Desconocido"
      />
    );

    const img = screen.getByRole('img', { name: 'Producto Misterioso' }) as HTMLImageElement;
    expect(img.src).toContain(DEFAULT_PRODUCT_IMAGE);
  });

  it('muestra el badge accesible de oferta si isOffer es true', () => {
    render(
      <ProductImage
        src="/images/products/arroz-diana-1lb.svg"
        alt="Arroz Diana"
        isOffer={true}
      />
    );

    const badge = screen.getByLabelText('Producto en oferta');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('🔥 Oferta');
  });

  it('soporta texto de oferta personalizado', () => {
    render(
      <ProductImage
        src="/images/products/arroz-diana-1lb.svg"
        alt="Arroz Diana"
        isOffer={true}
        offerBadgeText="Descuento 20%"
      />
    );

    const badge = screen.getByLabelText('Producto en oferta');
    expect(badge).toHaveTextContent('Descuento 20%');
  });

  it('oculta el badge si showOfferBadge es false o isOffer es false', () => {
    const { rerender } = render(
      <ProductImage
        src="/images/products/arroz-diana-1lb.svg"
        alt="Arroz Diana"
        isOffer={false}
      />
    );
    expect(screen.queryByLabelText('Producto en oferta')).not.toBeInTheDocument();

    rerender(
      <ProductImage
        src="/images/products/arroz-diana-1lb.svg"
        alt="Arroz Diana"
        isOffer={true}
        showOfferBadge={false}
      />
    );
    expect(screen.queryByLabelText('Producto en oferta')).not.toBeInTheDocument();
  });

  it('maneja error de carga con fallback limpio sin romper la interfaz', () => {
    const onErrorMock = vi.fn();

    render(
      <ProductImage
        src="https://servidor-caido.com/imagen-rota.jpg"
        alt="Galletas Saltín"
        productName="Galletas Saltín Noel"
        onError={onErrorMock}
      />
    );

    const img = screen.getByRole('img', { name: 'Galletas Saltín' }) as HTMLImageElement;

    // Primer fallo: debe intentar predecir por nombre
    fireEvent.error(img);
    expect(img.src).toContain('/images/products/saltin-noel.svg');

    // Segundo fallo (si incluso el fallback fallara): pasa a contenedor estilizado sin imagen rota
    fireEvent.error(img);
    expect(onErrorMock).toHaveBeenCalledTimes(1);

    const fallbackContainer = screen.getByRole('img', { name: 'Galletas Saltín' });
    expect(fallbackContainer).toBeInTheDocument();
    expect(fallbackContainer.tagName).not.toBe('IMG'); // No es una etiqueta img rota
  });
});
