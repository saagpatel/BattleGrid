import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});
vi.stubGlobal('localStorage', localStorageMock);

beforeEach(() => {
  storage.clear();
});
