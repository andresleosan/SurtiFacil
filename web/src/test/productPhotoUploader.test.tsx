import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductPhotoUploader } from '../components/ui/ProductPhotoUploader';
import * as compressorModule from '../utils/imageCompressor';

describe('<ProductPhotoUploader />', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza título por defecto y botones accesibles para cámara y galería', () => {
    render(
      <ProductPhotoUploader
        imageUrl=""
        productName="Leche Entera"
        category="Lácteos y Huevos"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Foto del Producto en Mostrador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tomar con Celular/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Subir de Galería/i })).toBeInTheDocument();
  });

  it('permite alternar el input para escribir URL directa manualmente', () => {
    const handleChange = vi.fn();
    render(
      <ProductPhotoUploader
        imageUrl=""
        productName="Pan Tajado"
        onChange={handleChange}
      />
    );

    const toggleBtn = screen.getByText(/O escribir \/ pegar URL web/i);
    fireEvent.click(toggleBtn);

    const input = screen.getByLabelText(/URL directa de imagen o ruta SVG local/i);
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '/images/products/pan-tajado.svg' } });
    expect(handleChange).toHaveBeenCalledWith('/images/products/pan-tajado.svg');
  });

  it('permite quitar la foto actual disparando onChange con string vacío y onRemove', () => {
    const handleChange = vi.fn();
    const handleRemove = vi.fn();

    render(
      <ProductPhotoUploader
        imageUrl="/images/products/leche-colanta-1l.svg"
        productName="Leche Colanta"
        onChange={handleChange}
        onRemove={handleRemove}
      />
    );

    const removeBtn = screen.getByRole('button', { name: /Quitar foto del producto/i });
    expect(removeBtn).toBeInTheDocument();

    fireEvent.click(removeBtn);

    expect(handleChange).toHaveBeenCalledWith('');
    expect(handleRemove).toHaveBeenCalled();
  });

  it('procesa y comprime una foto seleccionada llamando a compressProductImage', async () => {
    const handleChange = vi.fn();

    vi.spyOn(compressorModule, 'compressProductImage').mockResolvedValue({
      dataUrl: 'data:image/webp;base64,mockedCompressedBase64Data',
      format: 'webp',
      width: 800,
      height: 600,
      sizeBytes: 45 * 1024,
      sizeKB: 45.0,
      fileName: 'foto-producto.jpg',
    });

    render(
      <ProductPhotoUploader
        imageUrl=""
        productName="Arroz Diana"
        onChange={handleChange}
      />
    );

    const fileInput = screen.getByTestId('gallery-photo-input');
    const fakeFile = new File(['fake content'], 'foto-producto.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(compressorModule.compressProductImage).toHaveBeenCalledWith(fakeFile, expect.any(Object));
      expect(handleChange).toHaveBeenCalledWith('data:image/webp;base64,mockedCompressedBase64Data');
    });

    // Debe mostrar la información de optimización
    expect(await screen.findByText(/⚡ Optimizado WEBP:/i)).toBeInTheDocument();
    expect(screen.getByText(/45.0 KB/i)).toBeInTheDocument();
  });

  it('muestra mensaje de error si se selecciona un archivo que no es imagen', async () => {
    render(
      <ProductPhotoUploader
        imageUrl=""
        productName="Arroz Diana"
        onChange={vi.fn()}
      />
    );

    const fileInput = screen.getByTestId('gallery-photo-input');
    const fakeTextFile = new File(['texto'], 'documento.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [fakeTextFile] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Por favor selecciona un archivo de imagen válido (JPG, PNG o WebP).'
    );
  });
});
