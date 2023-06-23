import Shortcut from "../Shortcut.mjs";
import env from 'dotenv';

env.config({path: './security/.env'});

const RegisterShortcut = new Shortcut('register');

export default RegisterShortcut;
