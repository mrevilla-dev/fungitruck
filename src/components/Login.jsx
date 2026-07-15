import React, { useState } from "react";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Box, TextField, Button, Typography, Snackbar, Alert, CircularProgress, Divider } from "@mui/material";

const Login = ({ onSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const processUserRoles = async (user, userEmail, displayName) => {
    const userRef = doc(db, 'usuarios', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      let role = 'operario';
      let name = displayName || 'Usuario ' + userEmail.split('@')[0];

      if (userEmail === 'mrevilla@fvet.uba.ar') {
        role = 'admin';
        name = 'Maxi Revilla';
      } else if (userEmail === 'maximiliano.revilla@fvet.uba.ar' || userEmail === 'maximiliano.revilla@gmail.com') {
        role = 'admin';
        name = 'Maximiliano Revilla';
      } else if (userEmail === 'initra.citometria@fvet.uba.ar') {
        role = 'operario';
        name = 'Laboratorio Citometría';
      }

      await setDoc(userRef, {
        rol: role,
        nombre: name,
        email: userEmail,
        createdAt: new Date()
      });
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      
      await processUserRoles(userCredential.user, userCredential.user.email, userCredential.user.displayName);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setError("Error Google Auth: Verificá que el proveedor de Google esté habilitado en Firebase Console.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      await processUserRoles(userCredential.user, email, null);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setError("Error al iniciar sesión. Verificá tu contraseña o creá una cuenta.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Ingresá un correo y contraseña para crear la cuenta.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await processUserRoles(userCredential.user, email, null);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      maxWidth: 400,
      mx: 'auto',
      mt: '10vh',
      p: 4,
      borderRadius: 3,
      bgcolor: 'background.paper',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.2)'
    }}>
      <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 600, color: 'text.primary' }}>
        FungiTrack
      </Typography>
      <Typography variant="subtitle1" align="center" gutterBottom sx={{ color: 'text.secondary', mb: 3 }}>
        Control de Inventario
      </Typography>

      <Button
        variant="outlined"
        fullWidth
        disabled={loading}
        onClick={handleGoogleLogin}
        sx={{ mb: 3, py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: 2, borderColor: '#ccc', color: 'text.primary' }}
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" style={{ width: 24, marginRight: 12 }} />
        Continuar con Google
      </Button>

      <Divider sx={{ mb: 3, fontSize: '0.85rem', color: 'text.secondary' }}>o ingresá con email</Divider>
      
      <form onSubmit={handleSubmit}>
        <TextField
          label="Correo Institucional"
          type="email"
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          variant="outlined"
          InputProps={{ style: { fontSize: '1.1rem' } }}
        />
        <TextField
          label="Contraseña"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          variant="outlined"
          InputProps={{ style: { fontSize: '1.1rem' } }}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ 
            mt: 2, 
            py: 1.5, 
            fontSize: '1.1rem',
            textTransform: 'none',
            borderRadius: 2
          }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : 'Ingresar'}
        </Button>
        <Button
          variant="text"
          fullWidth
          disabled={loading}
          onClick={handleRegister}
          sx={{ 
            mt: 1, 
            py: 1, 
            fontSize: '1rem',
            textTransform: 'none',
            borderRadius: 2
          }}
        >
          Crear cuenta nueva
        </Button>
      </form>
      
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: '100%', fontSize: '1rem' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Login;
