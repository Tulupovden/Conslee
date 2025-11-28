import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LanguageSwitcher from './LanguageSwitcher';

// Mock the useI18n hook
vi.mock('../i18n/I18nContext', () => ({
  useI18n: () => ({
    language: 'en',
    setLanguage: vi.fn(),
  }),
}));

describe('LanguageSwitcher', () => {
  it('renders correctly', () => {
    render(<LanguageSwitcher />);
    // Check if the dropdown is rendered. 
    // Since CustomDropdown likely renders a button or input, we can look for the current value 'English'
    expect(screen.getByText('English')).toBeInTheDocument();
  });
});
