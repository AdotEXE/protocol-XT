import { inject } from '@vercel/analytics';
import { Game } from './game';

console.log('Protocol TX Client Starting...');

// Initialize Vercel Web Analytics
inject();

new Game();
