import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Map, View } from 'ol';
import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import { get as getProjection, Projection } from 'ol/proj';
import { getCenter } from 'ol/extent';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import Circle from 'ol/geom/Circle';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';
import { Coordinate } from 'ol/coordinate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { showSuccess, showError } from '@/utils/toast';
import { Draw, Modify, Snap } from 'ol/interaction';

interface Beacon {
  id: string;
  position: Coordinate; // [x, y] in map coordinates (meters)
  rssi?: number;
}

interface Antenna {
  id: string;
  position: Coordinate; // [x, y] in map coordinates (meters)
  height: number; // Height of installation in meters
  angle: number; // Angle of algorithm operation (degrees)
  range: number; // Coverage radius in meters
}

interface Barrier {
  id: string;
  coordinates: Coordinate[][]; // GeoJSON-like coordinates for Polygon
}

interface MapDisplayProps {
  mapImageSrc: string;
  mapWidthMeters: number;
  mapHeightMeters: number;
  onBeaconsChange: (beacons: Beacon[]) => void;
  initialBeacons?: Beacon[];
  onAntennasChange: (antennas: Antenna[]) => void; // New prop
  initialAntennas?: Antenna[]; // New prop
  onBarriersChange: (barriers: Barrier[]) => void; // New prop
  initialBarriers?: Barrier[]; // New prop
}

const MapDisplay: React.FC<MapDisplayProps> = ({
  mapImageSrc,
  mapWidthMeters,
  mapHeightMeters,
  onBeaconsChange,
  initialBeacons = [],
  onAntennasChange,
  initialAntennas = [],
  onBarriersChange,
  initialBarriers = [],
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<Map | null>(null);
  const [beacons, setBeacons] = useState<Beacon[]>(initialBeacons);
  const [antennas, setAntennas] = useState<Antenna[]>(initialAntennas);
  const [barriers, setBarriers] = useState<Barrier[]>(initialBarriers);

  const [isManualBeaconPlacementMode, setIsManualBeaconPlacementMode] = useState(false);
  const [isManualAntennaPlacementMode, setIsManualAntennaPlacementMode] = useState(false);
  const [isDrawingBarrierMode, setIsDrawingBarrierMode] = useState(false);
  const [isEditingBeaconsMode, setIsEditingBeaconsMode] = useState(false);
  const [isEditingAntennasMode, setIsEditingAntennasMode] = useState(false);
  const [isDeletingBeaconsMode, setIsDeletingBeaconsMode] = useState(false);
  const [isDeletingAntennasMode, setIsDeletingAntennaPlacementMode] = useState(false);
  const [isDeletingBarriersMode, setIsDeletingBarriersMode] = useState(false); // New state for deleting barriers

  const [autoRssi, setAutoRssi] = useState(70);
  const [autoBeaconStep, setAutoBeaconStep] = useState(5);

  const [autoAntennaHeight, setAutoAntennaHeight] = useState(2);
  const [autoAntennaAngle, setAutoAntennaAngle] = useState(0);

  // State for layer visibility
  const [showBeacons, setShowBeacons] = useState(true);
  const [showAntennas, setShowAntennas] = useState(true);
  const [showBarriers, setShowBarriers] = useState(true);
  const [showAntennaRanges, setShowAntennaRanges] = useState(true);

  // New state for hovered feature ID
  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);

  const calculatedAntennaRange = Math.max(
    10, // Default to 10m if calculation yields less
    5 + (autoAntennaHeight * 2) + (autoAntennaAngle / 360 * 5) // Example calculation
  );
  const calculatedAntennaStep = calculatedAntennaRange * 0.75;

  const beaconVectorSource = useRef(new VectorSource({ features: [] }));
  const beaconVectorLayer = useRef(new VectorLayer({ source: beaconVectorSource.current }));

  const antennaVectorSource = useRef(new VectorSource({ features: [] }));
  const antennaVectorLayer = useRef(new VectorLayer({ source: antennaVectorSource.current }));

  const barrierVectorSource = useRef(new VectorSource({ features: [] }));
  const barrierVectorLayer = useRef(new VectorLayer({ source: barrierVectorSource.current }));

  // Styles are defined outside useEffect to avoid re-creation unless dependencies change
  const beaconStyle = new Style({
    image: new Icon({
      anchor: [0.5, 1],
      src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="red" width="24px" height="24px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
      scale: 1.5,
    }),
  });

  const getAntennaStyle = useCallback((feature: Feature) => {
    const range = feature.get('range');
    const position = feature.getGeometry()?.getCoordinates();

    // Always start with the base icon style in an array
    const styles: Style[] = [
      new Style({
        image: new Icon({
          anchor: [0.5, 1],
          src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="blue" width="24px" height="24px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
          scale: 1.5,
        }),
      }),
    ];

    if (showAntennaRanges) { // Conditionally add the range circle style
      if (position && range !== undefined) { // Ensure position and range exist before creating circle
        styles.push(
          new Style({
            geometry: new Circle(position, range),
            fill: new Fill({
              color: 'rgba(0, 0, 255, 0.1)',
            }),
            stroke: new Stroke({
              color: 'blue',
              width: 1,
            }),
          })
        );
      }
    }
    return styles;
  }, [showAntennaRanges]); // Add showAntennaRanges to dependencies

  const barrierStyle = new Style({
    fill: new Fill({
      color: 'rgba(255, 0, 0, 0.3)',
    }),
    stroke: new Stroke({
      color: 'red',
      width: 2,
    }),
  });

  const sketchStyle = new Style({
    fill: new Fill({
      color: 'rgba(255, 255, 255, 0.2)',
    }),
    stroke: new Stroke({
      color: 'rgba(255, 0, 0, 0.7)',
      width: 2,
    }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({
        color: 'rgba(255, 0, 0, 0.7)',
      }),
      stroke: new Stroke({
        color: 'rgba(255, 255, 255, 0.8)',
        width: 1,
      }),
    }),
  });

  // New hover style for highlighting features
  const hoverStyle = new Style({
    stroke: new Stroke({
      color: 'cyan', // Bright color for highlight
      width: 3,
    }),
    image: new CircleStyle({
      radius: 10, // Larger circle for visibility
      stroke: new Stroke({
        color: 'cyan',
        width: 3,
      }),
      fill: new Fill({
        color: 'rgba(0, 255, 255, 0.1)', // Slightly transparent fill
      }),
    }),
  });

  useEffect(() => {
    if (!mapRef.current) return;

    const imageExtent = [0, 0, mapWidthMeters, mapHeightMeters];
    // Define a custom pixel projection for the image
    const imageProjection = new Projection({
      code: 'pixel',
      units: 'pixels',
      extent: imageExtent,
    });

    const imageLayer = new ImageLayer({
      source: new ImageStatic({
        url: mapImageSrc,
        imageExtent: imageExtent,
        projection: imageProjection, // Use the custom pixel projection
      }),
    });

    const initialMap = new Map({
      target: mapRef.current,
      layers: [imageLayer, beaconVectorLayer.current, antennaVectorLayer.current, barrierVectorLayer.current],
      view: new View({
        projection: imageProjection, // View also uses the custom pixel projection
        center: getCenter(imageExtent),
        zoom: 0, // Start at zoom 0 to show the full image
        // No 'extent' constraint here, allowing panning outside
      }),
    });

    setMapInstance(initialMap);

    return () => {
      initialMap.setTarget(undefined);
    };
  }, [mapImageSrc, mapWidthMeters, mapHeightMeters]);

  // Effect to update layer visibility
  useEffect(() => {
    if (mapInstance) {
      beaconVectorLayer.current.setVisible(showBeacons);
      antennaVectorLayer.current.setVisible(showAntennas);
      barrierVectorLayer.current.setVisible(showBarriers);
    }
  }, [mapInstance, showBeacons, showAntennas, showBarriers]);

  // Effect to initialize beacons from props
  useEffect(() => {
    setBeacons(initialBeacons);
  }, [initialBeacons]);

  // Effect to initialize antennas from props
  useEffect(() => {
    setAntennas(initialAntennas);
  }, [initialAntennas]);

  // Effect to initialize barriers from props
  useEffect(() => {
    setBarriers(initialBarriers);
  }, [initialBarriers]);

  // Effect to update beacon features with dynamic styling (including hover)
  useEffect(() => {
    beaconVectorSource.current.clear();
    beacons.forEach(beacon => {
      const feature = new Feature({
        geometry: new Point(beacon.position),
        id: beacon.id,
      });
      feature.setStyle((f) => {
        const styles = [beaconStyle];
        if (f.get('id') === hoveredFeatureId) {
          styles.push(hoverStyle);
        }
        return styles;
      });
      beaconVectorSource.current.addFeature(feature);
    });
    onBeaconsChange(beacons);
  }, [beacons, onBeaconsChange, beaconStyle, hoveredFeatureId, hoverStyle]);

  // Effect to update antenna features with dynamic styling (including hover)
  useEffect(() => {
    antennaVectorSource.current.clear();
    antennas.forEach(antenna => {
      const feature = new Feature({
        geometry: new Point(antenna.position),
        id: antenna.id,
        height: antenna.height,
        angle: antenna.angle,
        range: antenna.range,
      });
      feature.setStyle((f) => {
        const styles = getAntennaStyle(f); // This returns an array of styles
        if (f.get('id') === hoveredFeatureId) {
          styles.push(hoverStyle);
        }
        return styles;
      });
      antennaVectorSource.current.addFeature(feature);
    });
    onAntennasChange(antennas);
  }, [antennas, onAntennasChange, getAntennaStyle, hoveredFeatureId, hoverStyle]);

  // Effect to update barrier features with dynamic styling (including hover)
  useEffect(() => {
    barrierVectorSource.current.clear();
    barriers.forEach(barrier => {
      const feature = new Feature({
        geometry: new Polygon(barrier.coordinates),
        id: barrier.id,
      });
      feature.setStyle((f) => {
        const styles = [barrierStyle];
        if (f.get('id') === hoveredFeatureId) {
          styles.push(hoverStyle);
        }
        return styles;
      });
      barrierVectorSource.current.addFeature(feature);
    });
    onBarriersChange(barriers);
  }, [barriers, onBarriersChange, barrierStyle, hoveredFeatureId, hoverStyle]);


  const handleMapClick = useCallback((event: any) => {
    if (!mapInstance) return;

    const coordinate = event.coordinate;

    if (isManualBeaconPlacementMode) {
      const newBeacon: Beacon = {
        id: `beacon-${Date.now()}`,
        position: coordinate,
      };
      setBeacons((prev) => [...prev, newBeacon]);
      showSuccess('Маяк добавлен вручную!');
    } else if (isManualAntennaPlacementMode) {
      const newAntenna: Antenna = {
        id: `antenna-${Date.now()}`,
        position: coordinate,
        height: autoAntennaHeight,
        angle: autoAntennaAngle,
        range: calculatedAntennaRange,
      };
      setAntennas((prev) => [...prev, newAntenna]);
      showSuccess('Антенна добавлена вручную!');
    } else if (isDeletingBeaconsMode) {
      mapInstance.forEachFeatureAtPixel(event.pixel, (feature) => {
        const featureId = feature.get('id');
        if (featureId && feature.getGeometry()?.getType() === 'Point') {
          setBeacons(prev => prev.filter(b => b.id !== featureId));
          showSuccess('Маяк удален!');
          return true; // Stop iterating
        }
        return false;
      }, {
        layerFilter: (layer) => layer === beaconVectorLayer.current,
        hitTolerance: 5, // Increased hit tolerance for easier clicking
      });
    } else if (isDeletingAntennasMode) {
      mapInstance.forEachFeatureAtPixel(event.pixel, (feature) => {
        const featureId = feature.get('id');
        if (featureId && feature.getGeometry()?.getType() === 'Point') {
          setAntennas(prev => prev.filter(a => a.id !== featureId));
          showSuccess('Антенна удалена!');
          return true; // Stop iterating
        }
        return false;
      }, {
        layerFilter: (layer) => layer === antennaVectorLayer.current,
        hitTolerance: 5, // Increased hit tolerance for easier clicking
      });
    } else if (isDeletingBarriersMode) {
      mapInstance.forEachFeatureAtPixel(event.pixel, (feature) => {
        const featureId = feature.get('id');
        if (featureId && feature.getGeometry()?.getType() === 'Polygon') {
          setBarriers(prev => prev.filter(b => b.id !== featureId));
          showSuccess('Барьер удален!');
          return true; // Stop iterating
        }
        return false;
      }, {
        layerFilter: (layer) => layer === barrierVectorLayer.current,
        hitTolerance: 5, // Increased hit tolerance for easier clicking
      });
    }
  }, [
    isManualBeaconPlacementMode,
    isManualAntennaPlacementMode,
    isDeletingBeaconsMode,
    isDeletingAntennasMode,
    isDeletingBarriersMode,
    mapInstance,
    autoAntennaHeight,
    autoAntennaAngle,
    calculatedAntennaRange,
    beacons,
    antennas,
    barriers,
  ]);

  useEffect(() => {
    if (mapInstance) {
      mapInstance.un('click', handleMapClick);
      if (isManualBeaconPlacementMode || isManualAntennaPlacementMode || isDeletingBeaconsMode || isDeletingAntennasMode || isDeletingBarriersMode) {
        mapInstance.on('click', handleMapClick);
      }
    }
  }, [mapInstance, isManualBeaconPlacementMode, isManualAntennaPlacementMode, isDeletingBeaconsMode, isDeletingAntennasMode, isDeletingBarriersMode, handleMapClick]);

  // Effect to manage Draw interaction for barriers
  useEffect(() => {
    if (!mapInstance) return;

    let drawInteraction: Draw | null = null;
    let snapInteraction: Snap | null = null;

    const onDrawEnd = (event: any) => {
      const newBarrier: Barrier = {
        id: `barrier-${Date.now()}`,
        coordinates: (event.feature.getGeometry() as Polygon).getCoordinates(),
      };
      setBarriers((prev) => [...prev, newBarrier]);
      event.feature.setStyle(barrierStyle);
      showSuccess('Барьер добавлен!');
      // Force re-render to update area calculations
      barrierVectorSource.current.changed();
    };

    if (isDrawingBarrierMode) {
      drawInteraction = new Draw({
        source: barrierVectorSource.current,
        type: 'Polygon',
        style: sketchStyle,
      });
      mapInstance.addInteraction(drawInteraction);

      snapInteraction = new Snap({ source: barrierVectorSource.current });
      mapInstance.addInteraction(snapInteraction);

      drawInteraction.on('drawend', onDrawEnd);
    }

    return () => {
      if (drawInteraction) {
        drawInteraction.un('drawend', onDrawEnd);
        mapInstance.removeInteraction(drawInteraction);
      }
      if (snapInteraction) {
        mapInstance.removeInteraction(snapInteraction);
      }
    };
  }, [mapInstance, isDrawingBarrierMode, sketchStyle, barrierStyle, setBarriers]);

  // Effect to manage Modify interaction for barriers
  useEffect(() => {
    if (!mapInstance) return;

    let modifyInteraction: Modify | null = null;
    let snapInteraction: Snap | null = null;

    const onModifyEnd = (event: any) => {
      event.features.forEach((feature: Feature) => {
        const id = feature.get('id');
        const geometry = feature.getGeometry();
        if (id && geometry instanceof Polygon) {
          setBarriers(prevBarriers =>
            prevBarriers.map(b =>
              b.id === id ? { ...b, coordinates: geometry.getCoordinates() } : b
            )
          );
        }
      });
      showSuccess('Барьер обновлен!');
      // Force re-render to update area calculations
      barrierVectorSource.current.changed();
    };

    // Only enable modify if not in drawing mode
    if (!isDrawingBarrierMode) {
      modifyInteraction = new Modify({
        source: barrierVectorSource.current,
        style: sketchStyle,
      });
      mapInstance.addInteraction(modifyInteraction);

      snapInteraction = new Snap({ source: barrierVectorSource.current });
      mapInstance.addInteraction(snapInteraction);

      modifyInteraction.on('modifyend', onModifyEnd);
    }

    return () => {
      if (modifyInteraction) {
        modifyInteraction.un('modifyend', onModifyEnd);
        mapInstance.removeInteraction(modifyInteraction);
      }
      if (snapInteraction) {
        mapInstance.removeInteraction(snapInteraction);
      }
    };
  }, [mapInstance, isDrawingBarrierMode, sketchStyle, setBarriers]);

  // Effect to manage Modify and Snap interactions for beacons
  useEffect(() => {
    if (!mapInstance) return;

    let modifyBeaconInteraction: Modify | null = null;
    let snapBeaconInteraction: Snap | null = null;

    const onModifyEnd = (event: any) => {
      event.features.forEach((feature: Feature) => {
        const id = feature.get('id');
        const geometry = feature.getGeometry();
        if (id && geometry instanceof Point) {
          setBeacons(prevBeacons =>
            prevBeacons.map(b =>
              b.id === id ? { ...b, position: geometry.getCoordinates() as Coordinate } : b
            )
          );
        }
      });
      showSuccess('Позиция маяка обновлена!');
    };

    if (isEditingBeaconsMode) { // Only add interactions if editing mode is active
      modifyBeaconInteraction = new Modify({
        source: beaconVectorSource.current,
        style: sketchStyle,
      });
      mapInstance.addInteraction(modifyBeaconInteraction);

      snapBeaconInteraction = new Snap({ source: beaconVectorSource.current });
      mapInstance.addInteraction(snapBeaconInteraction);

      modifyBeaconInteraction.on('modifyend', onModifyEnd);
    }

    return () => {
      if (modifyBeaconInteraction) {
        modifyBeaconInteraction.un('modifyend', onModifyEnd);
        mapInstance.removeInteraction(modifyBeaconInteraction);
      }
      if (snapBeaconInteraction) {
        mapInstance.removeInteraction(snapBeaconInteraction);
      }
    };
  }, [mapInstance, sketchStyle, isEditingBeaconsMode, setBeacons]);

  // Effect to manage Modify and Snap interactions for antennas
  useEffect(() => {
    if (!mapInstance) return;

    let modifyAntennaInteraction: Modify | null = null;
    let snapAntennaInteraction: Snap | null = null;

    const onModifyEnd = (event: any) => {
      event.features.forEach((feature: Feature) => {
        const id = feature.get('id');
        const geometry = feature.getGeometry();
        if (id && geometry instanceof Point) {
          setAntennas(prevAntennas =>
            prevAntennas.map(a =>
              a.id === id ? { ...a, position: geometry.getCoordinates() as Coordinate } : a
            )
          );
        }
      });
      showSuccess('Позиция антенны обновлена!');
    };

    if (isEditingAntennasMode) { // Only add interactions if editing mode is active
      modifyAntennaInteraction = new Modify({
        source: antennaVectorSource.current,
        style: sketchStyle,
      });
      mapInstance.addInteraction(modifyAntennaInteraction);

      snapAntennaInteraction = new Snap({ source: antennaVectorSource.current });
      mapInstance.addInteraction(snapAntennaInteraction);

      modifyAntennaInteraction.on('modifyend', onModifyEnd);
    }

    return () => {
      if (modifyAntennaInteraction) {
        modifyAntennaInteraction.un('modifyend', onModifyEnd);
        mapInstance.removeInteraction(modifyAntennaInteraction);
      }
      if (snapAntennaInteraction) {
        mapInstance.removeInteraction(snapAntennaInteraction);
      }
    };
  }, [mapInstance, sketchStyle, isEditingAntennasMode, setAntennas]);

  // New useEffect for pointermove to detect hovered features
  useEffect(() => {
    if (!mapInstance) return;

    const handlePointerMove = (event: any) => {
      if (isDeletingBeaconsMode || isDeletingAntennasMode || isDeletingBarriersMode) {
        let foundFeatureId: string | null = null;
        mapInstance.forEachFeatureAtPixel(event.pixel, (feature) => {
          const featureId = feature.get('id');
          const featureType = feature.getGeometry()?.getType();

          if (featureId) {
            const isBeacon = beacons.some(b => b.id === featureId);
            const isAntenna = antennas.some(a => a.id === featureId);
            const isBarrier = barriers.some(b => b.id === featureId);

            if (
              (isDeletingBeaconsMode && isBeacon && featureType === 'Point') ||
              (isDeletingAntennasMode && isAntenna && featureType === 'Point') ||
              (isDeletingBarriersMode && isBarrier && featureType === 'Polygon')
            ) {
              foundFeatureId = featureId;
              return true; // Stop iterating
            }
          }
          return false;
        }, {
          layerFilter: (layer) => layer === beaconVectorLayer.current || layer === antennaVectorLayer.current || layer === barrierVectorLayer.current,
          hitTolerance: 10, // Increased hit tolerance for hover detection
        });
        setHoveredFeatureId(foundFeatureId);
      } else {
        setHoveredFeatureId(null); // Clear hover if not in deletion mode
      }
    };

    mapInstance.on('pointermove', handlePointerMove);

    return () => {
      mapInstance.un('pointermove', handlePointerMove);
      setHoveredFeatureId(null); // Clear on unmount or mode change
    };
  }, [mapInstance, isDeletingBeaconsMode, isDeletingAntennasMode, isDeletingBarriersMode, beacons, antennas, barriers]); // Dependencies for pointermove


  const handleAutoPlaceBeacons = () => {
    const newBeacons: Beacon[] = [];
    let idCounter = 0;

    const barrierGeometries = barrierVectorSource.current.getFeatures().map(f => f.getGeometry());

    for (let y = autoBeaconStep / 2; y < mapHeightMeters; y += autoBeaconStep) {
      for (let x = autoBeaconStep / 2; x < mapWidthMeters; x += autoBeaconStep) {
        const beaconPoint = new Point([x, y]);
        let isInsideBarrier = false;
        for (const barrierGeom of barrierGeometries) {
          if (barrierGeom instanceof Polygon && barrierGeom.intersectsCoordinate(beaconPoint.getCoordinates())) {
            isInsideBarrier = true;
            break;
          }
        }

        if (!isInsideBarrier) {
          newBeacons.push({
            id: `beacon-auto-${idCounter++}`,
            position: [x, y],
            rssi: autoRssi,
          });
        }
      }
    }
    setBeacons(newBeacons);
    setIsManualBeaconPlacementMode(false);
    setIsManualAntennaPlacementMode(false);
    setIsDrawingBarrierMode(false);
    setIsEditingBeaconsMode(false);
    setIsEditingAntennasMode(false);
    setIsDeletingBeaconsMode(false);
    setIsDeletingAntennaPlacementMode(false);
    setIsDeletingBarriersMode(false);
    showSuccess(`Автоматически размещено ${newBeacons.length} маяков (с учетом барьеров).`);
  };

  const handleAutoPlaceAntennas = () => {
    const newAntennas: Antenna[] = [];
    let idCounter = 0;

    const barrierGeometries = barrierVectorSource.current.getFeatures().map(f => f.getGeometry());

    for (let y = calculatedAntennaStep / 2; y < mapHeightMeters; y += calculatedAntennaStep) {
      for (let x = calculatedAntennaStep / 2; x < mapWidthMeters; x += calculatedAntennaStep) {
        const antennaPoint = new Point([x, y]);
        let isInsideBarrier = false;
        for (const barrierGeom of barrierGeometries) {
          if (barrierGeom instanceof Polygon && barrierGeom.intersectsCoordinate(antennaPoint.getCoordinates())) {
            isInsideBarrier = true;
            break;
          }
        }

        if (!isInsideBarrier) {
          newAntennas.push({
            id: `antenna-auto-${idCounter++}`,
            position: [x, y],
            height: autoAntennaHeight,
            angle: autoAntennaAngle,
            range: calculatedAntennaRange,
          });
        }
      }
    }
    setAntennas(newAntennas);
    setIsManualBeaconPlacementMode(false);
    setIsManualAntennaPlacementMode(false);
    setIsDrawingBarrierMode(false);
    setIsEditingBeaconsMode(false);
    setIsEditingAntennasMode(false);
    setIsDeletingBeaconsMode(false);
    setIsDeletingAntennaPlacementMode(false);
    setIsDeletingBarriersMode(false);
    showSuccess(`Автоматически размещено ${newAntennas.length} антенн (с учетом барьеров).`);
  };

  const handleClearBeacons = () => {
    setBeacons([]);
    showSuccess('Все маяки удалены.');
  };

  const handleClearAntennas = () => {
    setAntennas([]);
    showSuccess('Все антенны удалены.');
  };

  const handleClearBarriers = () => {
    setBarriers([]); // Clear state
    barrierVectorSource.current.clear(); // Clear OpenLayers source
    showSuccess('Все барьеры удалены.');
    // Force re-render to update area calculations
    barrierVectorSource.current.changed();
  };

  const handleExportMapToPNG = () => {
    if (!mapInstance) {
      showError('Карта не инициализирована.');
      return;
    }

    // Create a temporary div to host the off-screen map
    const exportDiv = document.createElement('div');
    // Set a large enough size for the export map to ensure good resolution
    // For example, 10 pixels per meter
    const exportResolution = 10;
    exportDiv.style.width = `${mapWidthMeters * exportResolution}px`;
    exportDiv.style.height = `${mapHeightMeters * exportResolution}px`;
    exportDiv.style.position = 'absolute';
    exportDiv.style.top = '-9999px'; // Hide it off-screen
    document.body.appendChild(exportDiv);

    const imageExtent = [0, 0, mapWidthMeters, mapHeightMeters];
    const imageProjection = new Projection({
      code: 'pixel',
      units: 'pixels',
      extent: imageExtent,
    });

    const imageLayer = new ImageLayer({
      source: new ImageStatic({
        url: mapImageSrc,
        imageExtent: imageExtent,
        projection: imageProjection,
      }),
    });

    // Create new vector layers for the export map, using the existing sources
    // and applying the default styles (without hover effects)
    const exportBeaconLayer = new VectorLayer({
      source: beaconVectorSource.current,
      style: beaconStyle,
    });
    exportBeaconLayer.setVisible(showBeacons);

    const exportAntennaLayer = new VectorLayer({
      source: antennaVectorSource.current,
      style: (feature) => getAntennaStyle(feature), // Use the style function
    });
    exportAntennaLayer.setVisible(showAntennas);

    const exportBarrierLayer = new VectorLayer({
      source: barrierVectorSource.current,
      style: barrierStyle,
    });
    exportBarrierLayer.setVisible(showBarriers);

    const exportMap = new Map({
      target: exportDiv,
      layers: [imageLayer, exportBeaconLayer, exportAntennaLayer, exportBarrierLayer],
      view: new View({
        projection: imageProjection,
        center: getCenter(imageExtent),
        zoom: 0, // Start at zoom 0 to show the full image
      }),
    });

    // Fit the view to the full extent of the map image, using the exportDiv's size
    exportMap.getView().fit(imageExtent, { size: exportMap.getSize() });

    exportMap.once('rendercomplete', () => {
      try {
        const exportCanvas = exportDiv.querySelector('canvas') as HTMLCanvasElement;
        if (!exportCanvas) {
          showError('Не удалось найти холст для экспорта.');
          return;
        }

        const link = document.createElement('a');
        link.download = 'map_export.png';
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
        showSuccess('Карта успешно экспортирована в PNG!');
      } catch (error) {
        console.error('Ошибка при экспорте карты:', error);
        showError('Ошибка при экспорте карты. Возможно, из-за ограничений безопасности браузера (CORS) для изображений.');
      } finally {
        // Clean up the temporary map and div
        exportMap.setTarget(undefined);
        document.body.removeChild(exportDiv);
      }
    });

    // Force a render of the export map
    exportMap.renderSync();
  };

  // Calculate map areas
  const totalMapArea = mapWidthMeters * mapHeightMeters;
  const totalBarrierArea = barrierVectorSource.current.getFeatures().reduce((sum, feature) => {
    const geometry = feature.getGeometry();
    if (geometry instanceof Polygon) {
      return sum + geometry.getArea();
    }
    return 0; // Return 0 if geometry is not a Polygon
  }, 0);
  const movableArea = totalMapArea - totalBarrierArea;


  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setIsManualBeaconPlacementMode(!isManualBeaconPlacementMode);
            setIsManualAntennaPlacementMode(false);
            setIsDrawingBarrierMode(false);
            setIsEditingBeaconsMode(false);
            setIsEditingAntennasMode(false);
            setIsDeletingBeaconsMode(false);
            setIsDeletingAntennaPlacementMode(false);
            setIsDeletingBarriersMode(false);
          }}
          variant={isManualBeaconPlacementMode ? 'destructive' : 'default'}
        >
          {isManualBeaconPlacementMode ? 'Выйти из режима ручной расстановки маяков' : 'Включить ручную расстановку маяков'}
        </Button>
        <Button
          onClick={() => {
            setIsManualAntennaPlacementMode(!isManualAntennaPlacementMode);
            setIsManualBeaconPlacementMode(false);
            setIsDrawingBarrierMode(false);
            setIsEditingBeaconsMode(false);
            setIsEditingAntennasMode(false);
            setIsDeletingBeaconsMode(false);
            setIsDeletingAntennaPlacementMode(false);
            setIsDeletingBarriersMode(false);
          }}
          variant={isManualAntennaPlacementMode ? 'destructive' : 'default'}
        >
          {isManualAntennaPlacementMode ? 'Выйти из режима ручной расстановки антенн' : 'Включить ручную расстановку антенн'}
        </Button>
        <Button
          onClick={() => {
            setIsDrawingBarrierMode(!isDrawingBarrierMode);
            setIsManualBeaconPlacementMode(false);
            setIsManualAntennaPlacementMode(false);
            setIsEditingBeaconsMode(false);
            setIsEditingAntennasMode(false);
            setIsDeletingBeaconsMode(false);
            setIsDeletingAntennaPlacementMode(false);
            setIsDeletingBarriersMode(false);
          }}
          variant={isDrawingBarrierMode ? 'destructive' : 'default'}
        >
          {isDrawingBarrierMode ? 'Выйти из режима рисования барьеров' : 'Включить рисование барьеров'}
        </Button>
        <Button
          onClick={() => {
            setIsEditingBeaconsMode(!isEditingBeaconsMode);
            setIsManualBeaconPlacementMode(false);
            setIsManualAntennaPlacementMode(false);
            setIsDrawingBarrierMode(false);
            setIsEditingAntennasMode(false);
            setIsDeletingBeaconsMode(false);
            setIsDeletingAntennaPlacementMode(false);
            setIsDeletingBarriersMode(false);
          }}
          variant={isEditingBeaconsMode ? 'destructive' : 'default'}
        >
          {isEditingBeaconsMode ? 'Выйти из режима редактирования маяков' : 'Редактировать маяки'}
        </Button>
        <Button
          onClick={() => {
            setIsEditingAntennasMode(!isEditingAntennasMode);
            setIsManualBeaconPlacementMode(false);
            setIsManualAntennaPlacementMode(false);
            setIsDrawingBarrierMode(false);
            setIsEditingBeaconsMode(false);
            setIsDeletingBeaconsMode(false);
            setIsDeletingAntennaPlacementMode(false);
            setIsDeletingBarriersMode(false);
          }}
          variant={isEditingAntennasMode ? 'destructive' : 'default'}
        >
          {isEditingAntennasMode ? 'Выйти из режима редактирования антенн' : 'Редактировать антенны'}
        </Button>
        <Button
          onClick={() => {
            setIsDeletingBeaconsMode(!isDeletingBeaconsMode);
            setIsManualBeaconPlacementMode(false);
            setIsManualAntennaPlacementMode(false);
            setIsDrawingBarrierMode(false);
            setIsEditingBeaconsMode(false);
            setIsEditingAntennasMode(false);
            setIsDeletingAntennaPlacementMode(false);
            setIsDeletingBarriersMode(false);
          }}
          variant={isDeletingBeaconsMode ? 'destructive' : 'default'}
        >
          {isDeletingBeaconsMode ? 'Выйти из режима удаления маяков' : 'Удалить маяк'}
        </Button>
        <Button
          onClick={() => {
            setIsDeletingAntennaPlacementMode(!isDeletingAntennasMode);
            setIsManualBeaconPlacementMode(false);
            setIsManualAntennaPlacementMode(false);
            setIsDrawingBarrierMode(false);
            setIsEditingBeaconsMode(false);
            setIsEditingAntennasMode(false);
            setIsDeletingBeaconsMode(false);
            setIsDeletingBarriersMode(false);
          }}
          variant={isDeletingAntennasMode ? 'destructive' : 'default'}
        >
          {isDeletingAntennasMode ? 'Выйти из режима удаления антенн' : 'Удалить антенну'}
        </Button>
        <Button
          onClick={() => {
            setIsDeletingBarriersMode(!isDeletingBarriersMode);
            setIsManualBeaconPlacementMode(false);
            setIsManualAntennaPlacementMode(false);
            setIsDrawingBarrierMode(false);
            setIsEditingBeaconsMode(false);
            setIsEditingAntennasMode(false);
            setIsDeletingBeaconsMode(false);
            setIsDeletingAntennaPlacementMode(false);
          }}
          variant={isDeletingBarriersMode ? 'destructive' : 'default'}
        >
          {isDeletingBarriersMode ? 'Выйти из режима удаления барьеров' : 'Удалить барьер'}
        </Button>
        <Button onClick={handleClearBeacons} variant="outline">
          Очистить все маяки
        </Button>
        <Button onClick={handleClearAntennas} variant="outline">
          Очистить все антенны
        </Button>
        <Button onClick={handleClearBarriers} variant="outline">
          Очистить все барьеры
        </Button>
        <Button onClick={handleExportMapToPNG} variant="secondary">
          Экспорт карты в PNG
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-md">
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoRssi">RSSI для авто-расстановки маяков ({autoRssi} dBm)</Label>
          <Slider
            id="autoRssi"
            min={-100}
            max={-30}
            step={1}
            value={[autoRssi]}
            onValueChange={(val) => setAutoRssi(val[0])}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoBeaconStep">Шаг расстановки маяков (метры: {autoBeaconStep} м)</Label>
          <Input
            id="autoBeaconStep"
            type="number"
            value={autoBeaconStep}
            onChange={(e) => setAutoBeaconStep(Number(e.target.value))}
            min="1"
            max="50"
            step="1"
          />
        </div>
        <Button onClick={handleAutoPlaceBeacons} className="col-span-full">
          Автоматически расставить маяки
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-md">
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoAntennaHeight">Высота антенн (метры: {autoAntennaHeight} м)</Label>
          <Input
            id="autoAntennaHeight"
            type="number"
            value={autoAntennaHeight}
            onChange={(e) => setAutoAntennaHeight(Number(e.target.value))}
            min="0"
            step="0.1"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoAntennaAngle">Угол антенн (градусы: {autoAntennaAngle}°)</Label>
          <Input
            id="autoAntennaAngle"
            type="number"
            value={autoAntennaAngle}
            onChange={(e) => setAutoAntennaAngle(Number(e.target.value))}
            min="0"
            max="360"
            step="1"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Радиус покрытия антенн (метры: {calculatedAntennaRange.toFixed(2)} м)</Label>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Шаг расстановки антенн (метры: {calculatedAntennaStep.toFixed(2)} м)</Label>
        </div>
        <Button onClick={handleAutoPlaceAntennas} className="col-span-full">
          Автоматически расставить антенны
        </Button>
      </div>

      {/* Layer Management Section */}
      <div className="p-4 border rounded-md flex flex-col sm:flex-row gap-4 sm:gap-8 items-start sm:items-center">
        <h3 className="text-lg font-semibold">Управление слоями:</h3>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showBeacons"
            checked={showBeacons}
            onCheckedChange={(checked) => setShowBeacons(Boolean(checked))}
          />
          <Label htmlFor="showBeacons">Показать маяки</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showAntennas"
            checked={showAntennas}
            onCheckedChange={(checked) => setShowAntennas(Boolean(checked))}
          />
          <Label htmlFor="showAntennas">Показать антенны</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showBarriers"
            checked={showBarriers}
            onCheckedChange={(checked) => setShowBarriers(Boolean(checked))}
          />
          <Label htmlFor="showBarriers">Показать барьеры</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showAntennaRanges"
            checked={showAntennaRanges}
            onCheckedChange={(checked) => setShowAntennaRanges(Boolean(checked))}
          />
          <Label htmlFor="showAntennaRanges">Показать радиус антенн</Label>
        </div>
      </div>

      {/* Map Statistics Section */}
      <div className="p-4 border rounded-md grid grid-cols-1 md:grid-cols-3 gap-4">
        <h3 className="text-lg font-semibold col-span-full">Статистика карты:</h3>
        <div>
          <Label>Общая площадь карты:</Label>
          <p className="text-lg font-medium">{totalMapArea.toFixed(2)} м²</p>
        </div>
        <div>
          <Label>Площадь барьеров:</Label>
          <p className="text-lg font-medium">{totalBarrierArea.toFixed(2)} м²</p>
        </div>
        <div>
          <Label>Площадь перемещений:</Label>
          <p className="text-lg font-medium">{movableArea.toFixed(2)} м²</p>
        </div>
        <div>
          <Label>Количество маяков:</Label>
          <p className="text-lg font-medium">{beacons.length}</p>
        </div>
        <div>
          <Label>Количество антенн:</Label>
          <p className="text-lg font-medium">{antennas.length}</p>
        </div>
        <div>
          <Label>Количество барьеров:</Label>
          <p className="text-lg font-medium">{barriers.length}</p>
        </div>
      </div>

      <div ref={mapRef} className="w-full h-[600px] border rounded-md" />

      {beacons.length > 0 && (
        <div className="mt-4 p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Размещенные маяки:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {beacons.map((beacon) => (
              <div key={beacon.id} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-sm text-sm">
                ID: {beacon.id.substring(0, 8)}... <br />
                Позиция: ({beacon.position[0].toFixed(2)}м, {beacon.position[1].toFixed(2)}м)
                {beacon.rssi && <><br />RSSI: {beacon.rssi} dBm</>}
              </div>
            ))}
          </div>
        </div>
      )}

      {antennas.length > 0 && (
        <div className="mt-4 p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Размещенные антенны:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {antennas.map((antenna) => (
              <div key={antenna.id} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-sm text-sm">
                ID: {antenna.id.substring(0, 8)}... <br />
                Позиция: ({antenna.position[0].toFixed(2)}м, {antenna.position[1].toFixed(2)}м) <br />
                Высота: {antenna.height.toFixed(1)}м, Угол: {antenna.angle}° <br />
                Радиус: {antenna.range.toFixed(1)}м
              </div>
            ))}
          </div>
        </div>
      )}

      {barriers.length > 0 && (
        <div className="mt-4 p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Размещенные барьеры:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {barriers.map((barrier) => (
              <div key={barrier.id} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-sm text-sm">
                ID: {barrier.id.substring(0, 8)}... <br />
                Координаты: {barrier.coordinates.length} кольца
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapDisplay;