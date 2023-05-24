import { v4 as uuidv4 } from 'uuid';
import { BoxType, VisualizationType } from '../../../../common/types/custom_panels';

const calculatOverlapArea = (bb1: BoxType, bb2: BoxType) => {
  const xLeft = Math.max(bb1.x1, bb2.x1);
  const yTop = Math.max(bb1.y1, bb2.y1);
  const xRight = Math.min(bb1.x2, bb2.x2);
  const yBottom = Math.min(bb1.y2, bb2.y2);

  if (xRight < xLeft || yBottom < yTop) return 0;
  return (xRight - xLeft) * (yBottom - yTop);
};

const getTotalOverlapArea = (panelVisualizations: VisualizationType[]) => {
  const newVizBox = { x1: 0, y1: 0, x2: 6, y2: 4 };
  const currentVizBoxes = panelVisualizations.map((visualization) => {
    return {
      x1: visualization.x,
      y1: visualization.y,
      x2: visualization.x + visualization.w,
      y2: visualization.y + visualization.h,
    };
  });

  let isOverlapping = 0;
  currentVizBoxes.map((viz) => {
    isOverlapping += calculatOverlapArea(viz, newVizBox);
  });
  return isOverlapping;
};

// We want to check if the new visualization being added, can be placed at { x: 0, y: 0, w: 6, h: 4 };
// To check this we try to calculate overlap between all the current visualizations and new visualization
// if there is no overalap (i.e Total Overlap Area is 0), we place the new viz. in default position
// else, we add it to the bottom of the panel
const getNewVizDimensions = (panelVisualizations: VisualizationType[]) => {
  let maxY: number = 0;
  let maxYH: number = 0;

  // check if we can place the new visualization at default location
  if (getTotalOverlapArea(panelVisualizations) === 0) {
    return { x: 0, y: 0, w: 6, h: 4 };
  }

  // else place the new visualization at the bottom of the panel
  panelVisualizations.map((panelVisualization: VisualizationType) => {
    if (panelVisualization.y >= maxY) {
      maxY = panelVisualization.y;
      maxYH = panelVisualization.h;
    }
  });

  return { x: 0, y: maxY + maxYH, w: 6, h: 4 };
};

// Add Visualization in the  Panel
export const addVisualizationPanel = (
  // client: ILegacyScopedClusterClient,
  // panelId: string,
  savedVisualizationId: string,
  oldVisualizationId: string | undefined,
  allPanelVisualizations: VisualizationType[]
) => {
  try {
    // const allPanelVisualizations = await this.getVisualizations(client, panelId);

    let newDimensions;
    let visualizationsList = [] as VisualizationType[];
    if (oldVisualizationId === undefined) {
      newDimensions = getNewVizDimensions(allPanelVisualizations);
      visualizationsList = allPanelVisualizations;
    } else {
      allPanelVisualizations.map((visualization: VisualizationType) => {
        if (visualization.id !== oldVisualizationId) {
          visualizationsList.push(visualization);
        } else {
          newDimensions = {
            x: visualization.x,
            y: visualization.y,
            w: visualization.w,
            h: visualization.h,
          };
        }
      });
    }
    const newPanelVisualizations = [
      ...visualizationsList,
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId,
        ...newDimensions,
      },
    ];
    return newPanelVisualizations;
  } catch (error) {
    throw new Error('Add/Replace Visualization Error:' + error);
  }
};

// Add Multiple visualizations in a Panel
export const addMultipleVisualizations = (
  savedVisualizationIds: string[],
  allPanelVisualizations: VisualizationType[]
) => {
  try {
    let newDimensions;
    let visualizationsList = [...allPanelVisualizations];

    savedVisualizationIds.map((savedVisualizationId) => {
      newDimensions = getNewVizDimensions(visualizationsList);
      visualizationsList = [
        ...visualizationsList,
        {
          id: 'panel_viz_' + uuidv4(),
          savedVisualizationId,
          ...newDimensions,
        },
      ];
    });

    return visualizationsList;
  } catch (error) {
    throw new Error('Add Multiple Visualization Error:' + error);
  }
};
