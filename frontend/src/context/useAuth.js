import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

// Access the logged-in user and auth actions from any component
export const useAuth = () => useContext(AuthContext);
