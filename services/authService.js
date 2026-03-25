import { supabase } from "../config/supabase.js";

/**
 * Servicio para manejar autenticación con Supabase
 */

export const loginWithEmail = async (email, password) => {
  try {
    const response = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return {
      user: response.data.user,
      session: response.data.session,
      accessToken: response.data.session?.access_token,
    };
  } catch (error) {
    throw error;
  }
};

export const signUpWithEmail = async (email, password) => {
  try {
    const response = await supabase.auth.signUp({
      email,
      password,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return {
      user: response.data.user,
      session: response.data.session,
    };
  } catch (error) {
    throw error;
  }
};

export const verifyToken = async (token) => {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      throw new Error(error.message);
    }

    return user;
  } catch (error) {
    throw error;
  }
};

export const logout = async (token) => {
  try {
    // El logout en Supabase se maneja en el cliente, pero podemos invalidar aquí si es necesario
    const response = await supabase.auth.signOut();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return { message: "Sesión cerrada correctamente" };
  } catch (error) {
    throw error;
  }
};
