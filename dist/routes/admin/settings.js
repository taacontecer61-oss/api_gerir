import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { getAllSettings, setSetting } from '../../services/settings.js';
export const adminSettingsRoutes = async (app) => {
    // Leitura: qualquer sessão autenticada (valores não sensíveis, úteis para o painel).
    app.get('/api/admin/settings', { preHandler: [app.authenticate] }, async () => ({
        settings: await getAllSettings(),
    }));
    app.put('/api/admin/settings/:key', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.SETTINGS_MANAGE)],
    }, async (request) => {
        const { key } = request.params;
        const body = z.object({ value: z.union([z.string(), z.boolean()]) }).parse(request.body);
        return setSetting(request.user, key, body.value);
    });
};
