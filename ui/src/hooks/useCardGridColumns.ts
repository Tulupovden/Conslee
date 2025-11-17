import { useEffect, useRef } from "react";

interface CardInfo {
  itemCount: number;
  cardElement: HTMLElement | null;
  bodyElement: HTMLElement | null;
}

export function useCardGridColumns(
  cardIndex: number,
  columnIndex: number,
  itemCount: number,
  columnCount: number
) {
  const cardRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cardRef.current || !bodyRef.current) return;

    const updateColumns = () => {
      const cardsInRow: CardInfo[] = [];
      
      for (let col = 0; col < columnCount; col++) {
        const column = document.querySelector(
          `.cards-column:nth-child(${col + 1})`
        ) as HTMLElement;
        
        if (!column) continue;
        
        const cardInColumn = column.children[cardIndex] as HTMLElement;
        
        if (cardInColumn) {
          const body = cardInColumn.querySelector('.card-body') as HTMLElement;
          if (body) {
            const rows = body.querySelectorAll('.card-row');
            cardsInRow.push({
              itemCount: rows.length,
              cardElement: cardInColumn,
              bodyElement: body,
            });
          }
        }
      }

      if (cardsInRow.length === 0) return;

      const maxItems = Math.max(...cardsInRow.map(c => c.itemCount));
      
      const maxCardInfo = cardsInRow.find(c => c.itemCount === maxItems);
      if (!maxCardInfo || !maxCardInfo.bodyElement || !maxCardInfo.cardElement) return;
      
      const maxCardRect = maxCardInfo.cardElement.getBoundingClientRect();
      const maxBodyRect = maxCardInfo.bodyElement.getBoundingClientRect();
      const maxBodyWidth = maxBodyRect.width;
      const gap = 14;
      
      let minTileWidth = 180;
      if (window.innerWidth <= 720) {
        minTileWidth = 220;
      } else if (window.innerWidth <= 1024) {
        minTileWidth = 200;
      }
      
      let maxCardColumns = 1;
      if (maxItems >= 5) {
        maxCardColumns = Math.min(3, Math.ceil(maxItems / 2));
      } else if (maxItems >= 4) {
        maxCardColumns = 2;
      } else {
        maxCardColumns = 1;
      }
      
      const maxColumnsByWidth = Math.floor((maxBodyWidth + gap) / (minTileWidth + gap));
      maxCardColumns = Math.min(maxCardColumns, maxColumnsByWidth);
      
      if (maxCardRect.width >= 400) {
        maxCardColumns = Math.min(3, maxCardColumns);
      } else if (maxCardRect.width >= 300) {
        maxCardColumns = Math.min(2, maxCardColumns);
      } else {
        maxCardColumns = 1;
      }
      
      maxCardColumns = Math.min(maxCardColumns, maxItems);
      maxCardColumns = Math.max(1, maxCardColumns);
      
      const targetRows = Math.ceil(maxItems / maxCardColumns);
      
      cardsInRow.forEach((cardInfo) => {
        const { itemCount, bodyElement, cardElement } = cardInfo;
        if (!bodyElement || !cardElement) return;

        const cardRect = cardElement.getBoundingClientRect();
        const bodyRect = bodyElement.getBoundingClientRect();
        const bodyWidth = bodyRect.width;
        
        let optimalColumns = Math.ceil(itemCount / targetRows);
        
        const maxColumnsByWidth = Math.floor((bodyWidth + gap) / (minTileWidth + gap));
        optimalColumns = Math.min(optimalColumns, maxColumnsByWidth);
        
        if (cardRect.width >= 400) {
          optimalColumns = Math.min(3, optimalColumns);
        } else if (cardRect.width >= 300) {
          optimalColumns = Math.min(2, optimalColumns);
        } else {
          optimalColumns = 1;
        }
        
        optimalColumns = Math.min(optimalColumns, itemCount);
        optimalColumns = Math.max(1, optimalColumns);
        
        const actualRows = Math.ceil(itemCount / optimalColumns);
        if (actualRows > targetRows && optimalColumns < itemCount && optimalColumns < maxColumnsByWidth) {
          optimalColumns = Math.min(optimalColumns + 1, itemCount, maxColumnsByWidth);
        }
        
        if (cardRect.width >= 400) {
          optimalColumns = Math.min(3, optimalColumns);
        } else if (cardRect.width >= 300) {
          optimalColumns = Math.min(2, optimalColumns);
        } else {
          optimalColumns = 1;
        }
        
        optimalColumns = Math.min(optimalColumns, itemCount);
        optimalColumns = Math.max(1, optimalColumns);
        
        const actualTileWidth = (bodyWidth - (optimalColumns - 1) * gap) / optimalColumns;
        if (actualTileWidth < minTileWidth && optimalColumns > 1) {
          optimalColumns = Math.max(1, Math.floor((bodyWidth + gap) / (minTileWidth + gap)));
        }
        
        if (itemCount < maxItems) {
          const rowsWithCurrentColumns = Math.ceil(itemCount / optimalColumns);
          if (rowsWithCurrentColumns < targetRows) {
            optimalColumns = Math.max(1, Math.floor(itemCount / targetRows));
            
            if (optimalColumns > 1) {
              const finalTileWidth = (bodyWidth - (optimalColumns - 1) * gap) / optimalColumns;
              if (finalTileWidth < minTileWidth) {
                optimalColumns = 1;
              }
            }
          }
        }
        
        bodyElement.style.setProperty('--grid-columns', optimalColumns.toString());
      });
      
      const bodyHeights = cardsInRow.map(c => {
        if (!c.bodyElement) return 0;
        const currentMinHeight = c.bodyElement.style.minHeight;
        c.bodyElement.style.minHeight = '';
        const rect = c.bodyElement.getBoundingClientRect();
        const height = rect.height;
        c.bodyElement.style.minHeight = currentMinHeight;
        return height;
      });
      
      const maxBodyHeight = Math.max(...bodyHeights);
      const minBodyHeight = Math.min(...bodyHeights);
      
      const heightDifference = maxBodyHeight - minBodyHeight;
      const heightDifferencePercent = maxBodyHeight > 0 ? (heightDifference / maxBodyHeight) * 100 : 0;
      
      if (heightDifferencePercent > 15 && heightDifference > 30) {
        cardsInRow.forEach((cardInfo) => {
          if (cardInfo.bodyElement && maxBodyHeight > 0) {
            cardInfo.bodyElement.style.minHeight = '';
            const currentHeight = cardInfo.bodyElement.getBoundingClientRect().height;
            
            if (currentHeight < maxBodyHeight - 10) {
              cardInfo.bodyElement.style.minHeight = `${maxBodyHeight}px`;
            }
          }
        });
      } else {
        cardsInRow.forEach((cardInfo) => {
          if (cardInfo.bodyElement) {
            cardInfo.bodyElement.style.minHeight = '';
          }
        });
      }
    };

    const timeoutId = setTimeout(updateColumns, 100);
    
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updateColumns, 50);
    });
    
    resizeObserver.observe(cardRef.current);
    
    window.addEventListener('resize', updateColumns);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateColumns);
    };
  }, [cardIndex, columnIndex, itemCount, columnCount]);

  return { cardRef, bodyRef };
}

