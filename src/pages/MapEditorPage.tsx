import React, { useState, useCallback } from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MapDisplay from '@/components/MapDisplay';
import { showSuccess, showError } from '@/utils/toast';
import { useAuth } from '@/context/AuthContext'; // Импортируем useAuth
import { Link } from 'react-router-dom'; // Для кнопки "На главную"

interface Beacon {
  id: string;
  position: [number, number]; // [x, y] in map coordinates (meters)
  rssi?: number;
}

interface Antenna {
  id: string;
  position: [number, number]; // [x, y] in map coordinates (meters)
  height: number; // Height of installation in meters
  angle: number; // Angle of algorithm operation (degrees)
  range: number; // Coverage radius in meters
}

interface Barrier {
  id: string;
  coordinates: [number, number][][]; // GeoJSON-like coordinates for Polygon
}

interface MapData {
  mapImageSrc: string;
  mapWidthMeters: number;
  mapHeightMeters: number;
  beacons: Beacon[];
  antennas: Antenna[];
  barriers: Barrier[];
}

const MapEditorPage = () => {
  const { user, logout } = useAuth(); // Получаем user и logout из контекста
  const [mapImageFile, setMapImageFile] = useState<File | null>(null);
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [mapWidth, setMapWidth] = useState<number>(100); // Default width in meters
  const [mapHeight, setMapHeight] = useState<number>(100); // Default height in meters
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [antennas, setAntennas] = useState<Antenna[]>([]);
  const [barriers, setBarriers] = useState<Barrier[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setMapImageFile(event.target.files[0]);
      showSuccess('Файл карты выбран.');
    } else {
      setMapImageFile(null);
      setMapImageSrc(null);
    }
  };

  const handleLoadMap = () => {
    if (mapImageFile && mapWidth > 0 && mapHeight > 0) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMapImageSrc(reader.result as string);
        setBeacons([]); // Clear beacons when a new map is loaded
        setAntennas([]); // Clear antennas when a new map is loaded
        setBarriers([]); // Clear barriers when a new map is loaded
        showSuccess('Карта загружена и готова к использованию!');
      };
      reader.onerror = () => {
        showError('Ошибка при чтении файла карты.');
      };
      reader.readAsDataURL(mapImageFile);
    } else {
      showError('Пожалуйста, выберите файл карты и укажите корректные размеры.');
    }
  };

  const handleBeaconsChange = useCallback((newBeacons: Beacon[]) => {
    setBeacons(newBeacons);
  }, []);

  const handleAntennasChange = useCallback((newAntennas: Antenna[]) => {
    setAntennas(newAntennas);
  }, []);

  const handleBarriersChange = useCallback((newBarriers: Barrier[]) => {
    setBarriers(newBarriers);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-900 p-4">
      <Card className="w-full shadow-lg bg-gray-100 dark:bg-gray-900">
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle className="text-2xl font-bold">Управление картами и BLE-маяками</CardTitle>
          <div className="flex items-center space-x-4">
            {user && <span className="text-sm text-gray-600 dark:text-gray-400">Привет, {user.name || user.email}!</span>}
            <Link to="/">
              <Button variant="outline">На главную</Button>
            </Link>
            <Button onClick={logout} variant="destructive">Выйти</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="mapImage">Загрузить файл карты (изображение)</Label>
              <Input id="mapImage" type="file" accept="image/*" onChange={handleFileChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mapWidth">Ширина карты (метры)</Label>
              <Input
                id="mapWidth"
                type="number"
                value={mapWidth}
                onChange={(e) => setMapWidth(Number(e.target.value))}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mapHeight">Высота карты (метры)</Label>
              <Input
                id="mapHeight"
                type="number"
                value={mapHeight}
                onChange={(e) => setMapHeight(Number(e.target.value))}
                min="1"
              />
            </div>
            <Button onClick={handleLoadMap} className="md:col-span-3">
              Загрузить карту
            </Button>
          </div>

          {mapImageSrc && mapWidth > 0 && mapHeight > 0 ? (
            <MapDisplay
              mapImageSrc={mapImageSrc}
              mapWidthMeters={mapWidth}
              mapHeightMeters={mapHeight}
              onBeaconsChange={handleBeaconsChange}
              initialBeacons={beacons}
              onAntennasChange={handleAntennasChange}
              initialAntennas={antennas}
              onBarriersChange={handleBarriersChange}
              initialBarriers={barriers}
            />
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              Пожалуйста, загрузите карту, чтобы начать размещение маяков.
            </div>
          )}
        </CardContent>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default MapEditorPage;