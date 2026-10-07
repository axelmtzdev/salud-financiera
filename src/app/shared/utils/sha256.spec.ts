import { sha256 } from './sha256';

describe('sha256', () => {
  it('coincide con los vectores de prueba conocidos', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('procesa texto UTF-8 (acentos)', () => {
    expect(sha256('película')).toHaveSize(64);
    expect(sha256('película')).not.toBe(sha256('pelicula'));
  });
});
