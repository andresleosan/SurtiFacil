import { createContext, useContext } from 'react';
import { User, UserRole } from '../firebase/db';

const CurrentUserContext = createContext<User | null>(null);

export const CurrentUserProvider = CurrentUserContext.Provider;

/** Usuario autenticado actual o `null` cuando no hay sesión (o fuera del provider). */
export function useCurrentUser(): User | null {
  return useContext(CurrentUserContext);
}

/** `true` cuando el usuario actual tiene alguno de los roles indicados. */
export function useHasRole(roles: readonly UserRole[]): boolean {
  const user = useCurrentUser();
  return user !== null && roles.includes(user.role);
}
