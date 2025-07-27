import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MadeWithDyad } from "@/components/made-with-dyad";
import { useAuth } from '@/context/AuthContext';

const Home = () => {
  const { isAuthenticated, logout, user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-2xl shadow-lg bg-white dark:bg-gray-800 text-center">
        <CardHeader>
          <CardTitle className="text-3xl font-bold mb-2">Добро пожаловать в BLE Mapping App!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-lg text-gray-700 dark:text-gray-300">
            Инструмент для создания и управления картами помещений с размещением BLE-маяков и антенн.
          </p>

          {isAuthenticated ? (
            <div className="space-y-4">
              <p className="text-xl font-semibold">Привет, {user?.name || user?.email}!</p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link to="/map-editor">
                  <Button size="lg">Перейти к редактору карт</Button>
                </Link>
                <Button size="lg" variant="outline" onClick={logout}>
                  Выйти
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/login">
                <Button size="lg">Войти</Button>
              </Link>
              <Link to="/register">
                <Button size="lg" variant="outline">Зарегистрироваться</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default Home;