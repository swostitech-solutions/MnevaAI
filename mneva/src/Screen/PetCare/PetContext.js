import { createContext, useContext } from 'react';

export const PetContext = createContext(null);
export const usePet = () => useContext(PetContext);
