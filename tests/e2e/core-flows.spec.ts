import { expect, test } from '@playwright/test';

const mockUser = {
  id: 'user-admin',
  fullName: 'Administrador TI',
  email: 'admin@sect.local',
  role: 'admin',
  department: 'TI',
  approvedAt: new Date().toISOString(),
  emailVerifiedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

async function installApiMocks(page: import('@playwright/test').Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (path === '/api/auth/login' && method === 'POST') return json({ user: mockUser });
    if (path === '/api/auth/me' && method === 'GET') return json({ user: mockUser });
    if (path === '/api/auth/logout' && method === 'POST') return json({}, 204);

    if (path === '/api/atendimentos' && method === 'GET') return json([]);
    if (path === '/api/catalog-options' && method === 'GET') return json([]);
    if (path === '/api/notifications' && method === 'GET') {
      return json([
        {
          id: 'notif-1',
          userId: mockUser.id,
          title: 'Alerta de atividade',
          message: 'Uma atividade precisa de atenção.',
          kind: 'task',
          relatedEntity: 'task',
          relatedId: 'task-1',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    if (path === '/api/tasks' && method === 'GET') {
      return json([
        {
          id: 'task-1',
          title: 'Atualizar plano pedagógico',
          description: 'Revisar e aprovar plano',
          dueDate: '2026-03-15',
          priority: 'media',
          status: 'pendente',
          overdue: false,
          taskType: 'pedagogico',
          goalTarget: 'Meta A',
          teamId: 'team-1',
          teamName: 'Equipe Pedagógica',
          createdBy: mockUser.id,
          createdByName: mockUser.fullName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null,
          assignees: [mockUser],
        },
      ]);
    }
    if (path === '/api/teams' && method === 'GET') {
      return json([
        {
          id: 'team-1',
          name: 'Equipe Pedagógica',
          description: 'Equipe principal',
          members: [mockUser],
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    if (path === '/api/users' && method === 'GET') return json([mockUser]);
    if (path === '/api/tasks-metrics/secretary' && method === 'GET') return json({ byUser: [] });
    if (path === '/api/task-sla-profiles' && method === 'GET') return json([]);
    if (path === '/api/task-templates' && method === 'GET') return json([]);
    if (path.endsWith('/comments') && method === 'GET') return json([]);
    if (path.endsWith('/timeline') && method === 'GET') return json([]);
    if (path.endsWith('/attachments') && method === 'GET') return json([]);

    if (path === '/api/events' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ':\n\n',
      });
    }

    return json({ ok: true });
  });
}

test('login direto conclui autenticação', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/login');

  await page.getByTestId('login-email').fill('admin@sect.local');
  await page.getByTestId('login-password').fill('Secretario@2026!');
  await page.getByTestId('login-submit').click();

  await expect(page.getByText('Dashboard de Atendimentos/Atividades')).toBeVisible();
});

test('fluxo principal: notificações, Ctrl+K e Kanban', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  await expect(page.getByText('Dashboard de Atendimentos/Atividades')).toBeVisible();

  await expect(page.getByTestId('notifications-trigger')).toContainText('1 pendente');
  await page.getByTestId('notifications-trigger').click();
  await expect(page.getByText('Alerta de atividade')).toBeVisible();

  await page.keyboard.press('Control+K');
  await expect(page.getByTestId('global-search-input')).toBeVisible();
  await page.getByTestId('global-search-input').fill('equipe pedagógica');
  await page.getByTestId('global-search-result-equipe').first().click();
  await expect(page.getByText('Gestão de Equipe')).toBeVisible();

  await page.getByRole('button', { name: /Atividades/i }).click();
  await page.getByTestId('tasks-kanban-toggle').click();
  await expect(page.getByTestId('kanban-column-pendente')).toBeVisible();
});
