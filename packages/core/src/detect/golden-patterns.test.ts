import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { expect, it } from 'vitest';
import { analyze } from '../analysis.js';

async function fixture(files: Record<string, string>) {
  const path = await mkdtemp(join(tmpdir(), 'catalyst-framework-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      await mkdir(join(path, posix.dirname(name)), { recursive: true });
      await writeFile(join(path, name), source);
    }
    return await analyze(path);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}

it('follows nested FastAPI mounts to the bound settings field and SQLModel table inheritance', async () => {
  const r = await fixture({
    'pyproject.toml': '[project]\ndependencies=["fastapi","sqlmodel"]',
    'app/__init__.py': '',
    'app/api/__init__.py': '',
    'app/settings.py': [
      'from pydantic_settings import BaseSettings',
      'class UnusedSettings(BaseSettings):',
      '    API: str = "/wrong"',
      'class Settings(BaseSettings):',
      '    API: str = "/api/v1"',
      'settings = Settings()',
    ].join('\n'),
    'app/base.py': 'from sqlmodel import SQLModel\nclass ItemBase(SQLModel): pass',
    'app/models.py':
      'from app.base import ItemBase\nclass Item(ItemBase, table=True): pass\nclass PublicDTO(ItemBase): pass',
    'app/deps.py':
      'from fastapi import Depends\nfrom typing import Annotated\nCurrentUser = Annotated[str, Depends(get_current_user)]',
    'app/api/items.py': [
      'from fastapi import APIRouter',
      'from app.models import Item',
      'from app.deps import CurrentUser',
      'router = APIRouter(prefix="/items")',
      '@router.post("/")',
      'def create_item(session, data, user: CurrentUser):',
      '    item = Item.model_validate(data)',
      '    session.add(item)',
    ].join('\n'),
    'app/api/main.py':
      'from fastapi import APIRouter\nfrom app.api import items\napi = APIRouter()\napi.include_router(items.router)',
    'app/main.py':
      'from fastapi import FastAPI\nfrom app.api.main import api\nfrom app.settings import settings as config\napp = FastAPI()\napp.include_router(api, prefix=config.API)',
  });
  expect(r.nodes.filter((n) => n.kind === 'route').map((n) => n.id)).toEqual(['route:POST /api/v1/items/']);
  expect(r.nodes.filter((n) => n.kind === 'db_model').map((n) => n.id)).toEqual(['db:sqlalchemy:Item']);
  expect(r.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: 'route:POST /api/v1/items/',
        kind: 'handles',
        dst: 'sym:app/api/items.py#create_item',
      }),
      expect.objectContaining({
        src: 'sym:app/api/items.py#create_item',
        kind: 'writes',
        dst: 'db:sqlalchemy:Item',
        line: 8,
      }),
    ]),
  );
  expect(r.flags.some((f) => f.rule === 'missing-auth-on-mutating-route')).toBe(false);
});

it('attributes a Pages Router handler factory and links validated env properties to their consumers', async () => {
  const r = await fixture({
    'package.json': '{"dependencies":{"next":"*","next-auth":"*","@t3-oss/env-nextjs":"*"}}',
    'env.mjs': "import {createEnv} from '@t3-oss/env-nextjs'\nexport const env=createEnv({server:{}})",
    'pages/api/auth.ts':
      "import NextAuth from 'next-auth'\nimport {env as settings} from '../../env.mjs'\nexport default NextAuth({secret:settings.AUTH_SECRET})",
    'other.ts': 'const settings={OTHER_SECRET:0}; export const x=settings.OTHER_SECRET',
  });
  const handler = 'sym:pages/api/auth.ts#default';
  expect(r.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: 'route:ANY /api/auth', dst: handler, kind: 'handles' }),
      expect.objectContaining({ src: handler, dst: 'env:AUTH_SECRET', kind: 'uses_env', line: 3 }),
      expect.objectContaining({ src: handler, dst: 'svc:nextauth', kind: 'calls_service', line: 3 }),
    ]),
  );
  expect(r.nodes.some((n) => n.id === 'env:OTHER_SECRET')).toBe(false);
});
