import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';
import '../app/themes.css';
import '../app/shelf.css';
import '../app/front.css';

createRoot(document.getElementById('root')!).render(<Home />);
