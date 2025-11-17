import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

const CustomDropdown: React.FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = "Выберите...",
  disabled = false,
  className = "",
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0, openUpward: false });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = value ? options.find((opt) => opt.value === value) : null;

  useEffect(() => {
    const updateMenuPosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const estimatedMenuHeight = Math.min(400, availableOptions.length * 44 + 12);
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        
        let openUpward = false;
        let top: number;
        
        if (menuRef.current) {
          const menuRect = menuRef.current.getBoundingClientRect();
          const menuHeight = menuRect.height;
          
          const topDown = rect.bottom + 8;
          if (topDown + menuHeight <= window.innerHeight - 8) {
            top = topDown;
            openUpward = false;
          } else {
            top = rect.top - menuHeight - 8;
            if (top < 8) {
              top = 8;
            }
            openUpward = true;
          }
        } else {
          if (spaceBelow >= estimatedMenuHeight) {
            top = rect.bottom + 8;
            openUpward = false;
          } else if (spaceAbove > spaceBelow) {
            top = Math.max(8, rect.top - estimatedMenuHeight - 8);
            openUpward = true;
          } else {
            top = rect.bottom + 8;
            openUpward = false;
          }
        }
        
        setMenuPosition({
          top,
          left: rect.left,
          width: rect.width,
          openUpward,
        });
      }
    };

    if (isOpen) {
      updateMenuPosition();
      const handleScroll = () => updateMenuPosition();
      const handleResize = () => updateMenuPosition();
      
      document.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleScroll, true);
      
      return () => {
        document.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleScroll, true);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && highlightedIndex < options.length) {
      const optionElement = menuRef.current?.querySelector(
        `[data-option-index="${highlightedIndex}"]`
      ) as HTMLElement;
      optionElement?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen, options.length]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setHighlightedIndex(-1);
    }
  };

  const handleSelect = (option: Option) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          const option = options[highlightedIndex];
          if (option && !option.disabled) {
            handleSelect(option);
          }
        } else {
          setIsOpen(true);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => {
            const next = prev + 1;
            const availableOptions = options.filter((opt) => !opt.disabled);
            if (next >= availableOptions.length) return prev;
            return availableOptions.findIndex(
              (opt) => opt === options[next]
            );
          });
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex((prev) => {
            if (prev <= 0) return -1;
            const prevIndex = prev - 1;
            const availableOptions = options.filter((opt) => !opt.disabled);
            return availableOptions.findIndex(
              (opt) => opt === options[prevIndex]
            );
          });
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const availableOptions = options.filter((opt) => !opt.disabled);

  return (
    <div className={`custom-dropdown ${className} ${isOpen ? "is-open" : ""}`} ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-dropdown-button ${disabled ? "disabled" : ""} ${isOpen ? "open" : ""}`}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selectedOption?.label || placeholder}
        id={id}
      >
        <span className="custom-dropdown-value">
          {selectedOption && selectedOption.value ? selectedOption.label : placeholder}
        </span>
        <svg
          className="custom-dropdown-arrow"
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M6 8.5L2.5 5h7z"
            fill="currentColor"
          />
        </svg>
      </button>
      {isOpen && createPortal(
        <div 
            ref={menuRef}
            className={`custom-dropdown-menu-portal ${menuPosition.openUpward ? "open-upward" : ""}`}
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
            }}
          >
            <div className="custom-dropdown-menu-inner">
              {availableOptions.length === 0 ? (
                <div className="custom-dropdown-empty">Нет доступных опций</div>
              ) : (
                availableOptions.map((option) => {
                  const optionIndex = options.indexOf(option);
                  const isSelected = option.value === value;
                  const isHighlighted = optionIndex === highlightedIndex;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`custom-dropdown-option ${isSelected ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`}
                      onClick={() => handleSelect(option)}
                      onMouseEnter={() => setHighlightedIndex(optionIndex)}
                      data-option-index={optionIndex}
                    >
                      {option.label}
                      {isSelected && (
                        <svg
                          className="custom-dropdown-check"
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
        document.body
      )}
    </div>
  );
};

export default CustomDropdown;

