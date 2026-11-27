import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Allow lazy route chunks to load while the workspace test suite also builds the CLI.
configure({ asyncUtilTimeout: 4000 });
