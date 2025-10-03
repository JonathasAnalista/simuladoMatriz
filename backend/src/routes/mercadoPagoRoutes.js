import { Router } from 'express';
import axios from 'axios';
import { randomUUID } from 'crypto';
import {
  config,
  findTenantById,
  findTenantByOrigin
} from '../config.js';
import { activateProByEmail, activateProLegacyUser } from '../services/proActivation.js';

const PRICE_PRO_ANNUAL = 20.0;
const CLIENT_HEADER = 'x-leg-client';
const TENANT_ID_FIELDS = ['tenantId', 'clientId', 'cfcId'];

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const pickFirst = (value) => (Array.isArray(value) ? value[0] : value);

const extractTenantId = (req) => {
  const headerValue = normalizeString(req.get(CLIENT_HEADER));
  if (headerValue) return headerValue;

  for (const field of TENANT_ID_FIELDS) {
    const bodyValue = normalizeString(pickFirst(req.body?.[field]));
    if (bodyValue) return bodyValue;

    const queryValue = normalizeString(pickFirst(req.query?.[field]));
    if (queryValue) return queryValue;
  }

  return null;
};

const getOriginFromRequest = (req) => normalizeString(req.get('origin') || req.get('referer'));

const findTenantForRequest = (req) => {
  const tenantId = extractTenantId(req);
  if (tenantId) {
    const tenant = findTenantById(tenantId);
    return { tenant, via: 'id', detail: tenantId };
  }

  const origin = getOriginFromRequest(req);
  if (origin) {
    const tenant = findTenantByOrigin(origin);
    if (tenant) {
      return { tenant, via: 'origin', detail: origin };
    }
  }

  if (config.tenants.length === 1) {
    return { tenant: config.tenants[0], via: 'singleton', detail: config.tenants[0].id };
  }

  return { tenant: null, via: null, detail: null };
};

const resolveEffectiveConfig = (tenant) => ({
  tenant,
  frontendUrl: tenant?.frontendUrl || config.frontendUrl,
  baseUrl: tenant?.baseUrl || config.baseUrl,
  mpAccessToken: tenant?.mpAccessToken || config.mpAccessToken
});

const requireMercadoPagoToken = (res, token, tenantId) => {
  if (!token) {
    res.status(500).json({
      error: 'MP_ACCESS_TOKEN ausente para este tenant',
      tenantId: tenantId || null
    });
    return false;
  }
  return true;
};

const buildNotificationUrl = (baseUrl, tenantId) => {
  if (!baseUrl) return null;
  try {
    const url = new URL('/api/mp/webhook', baseUrl);
    if (tenantId) {
      url.searchParams.set('tenantId', tenantId);
    }
    return url.toString();
  } catch {
    return null;
  }
};

const router = Router();

router.post('/create-preference', async (req, res) => {
  try {
    const { tenant } = findTenantForRequest(req);
    const effective = resolveEffectiveConfig(tenant);

    if (config.tenants.length > 1 && !tenant) {
      return res.status(400).json({
        error: 'Tenant não reconhecido. Informe o cabeçalho X-Leg-Client.'
      });
    }

    const { uid, email } = req.body || {};
    if (!uid || !email) {
      return res.status(400).json({ error: 'uid/email obrigatórios' });
    }

    if (!requireMercadoPagoToken(res, effective.mpAccessToken, tenant?.id)) return;

    if (!effective.baseUrl || !/^https:\/\//i.test(effective.baseUrl)) {
      return res.status(500).json({ error: 'BASE_URL inválida (precisa ser HTTPS público)' });
    }

    if (!effective.frontendUrl || !/^https?:\/\//i.test(effective.frontendUrl)) {
      return res.status(500).json({ error: 'FRONTEND_URL inválida' });
    }

    const notificationUrl = buildNotificationUrl(effective.baseUrl, tenant?.id);
    if (!notificationUrl) {
      return res.status(500).json({ error: 'BASE_URL inválida (precisa ser HTTPS público)' });
    }

    const body = {
      items: [
        {
          title: 'Legmaster PRO - 1 ano',
          description: 'Acesso PRO por 12 meses',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: PRICE_PRO_ANNUAL
        }
      ],
      payer: { email },
      metadata: { uid, email, plan: 'PRO_1Y', amount: PRICE_PRO_ANNUAL, tenantId: tenant?.id || null },
      statement_descriptor: 'LEGMASTER',
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' },
          { id: 'atm' },
          { id: 'digital_currency' }
        ],
        installments: 1,
        default_installments: 1,
        default_payment_type_id: 'bank_transfer'
      },
      back_urls: {
        success: `${effective.frontendUrl}/pagamento/sucesso`,
        pending: `${effective.frontendUrl}/pagamento/pendente`,
        failure: `${effective.frontendUrl}/pagamento/erro`
      },
      auto_return: 'approved',
      notification_url: notificationUrl
    };

    const response = await axios.post(
      'https://api.mercadopago.com/checkout/preferences',
      body,
      { headers: { Authorization: `Bearer ${effective.mpAccessToken}` } }
    );

    return res.json({ init_point: response.data.init_point, tenantId: tenant?.id || null });
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    console.error('create-preference ERROR:', status, data || error.message);
    return res.status(500).json({
      error: 'Falha ao criar preferência',
      details: { status, data }
    });
  }
});

router.post('/pix/create', async (req, res) => {
  try {
    const { tenant } = findTenantForRequest(req);
    const effective = resolveEffectiveConfig(tenant);

    if (config.tenants.length > 1 && !tenant) {
      return res.status(400).json({
        error: 'Tenant não reconhecido. Informe o cabeçalho X-Leg-Client.'
      });
    }

    const { uid, email, amount } = req.body || {};
    if (!uid || !email) {
      return res.status(400).json({ error: 'uid/email obrigatórios' });
    }

    if (!requireMercadoPagoToken(res, effective.mpAccessToken, tenant?.id)) return;

    if (!effective.baseUrl || !/^https:\/\//i.test(effective.baseUrl)) {
      return res.status(500).json({ error: 'BASE_URL inválida (precisa ser HTTPS público)' });
    }

    const price = Number(amount || PRICE_PRO_ANNUAL);
    const notificationUrl = buildNotificationUrl(effective.baseUrl, tenant?.id);
    if (!notificationUrl) {
      return res.status(500).json({ error: 'BASE_URL inválida (precisa ser HTTPS público)' });
    }

    const body = {
      transaction_amount: price,
      description: 'Legmaster PRO - 1 ano',
      payment_method_id: 'pix',
      payer: { email },
      metadata: { uid, email, plan: 'PRO_1Y', amount: price, tenantId: tenant?.id || null },
      notification_url: notificationUrl
    };

    const idempotencyKey = `pix-${uid}-${Date.now()}-${randomUUID()}`;

    console.log('[pix/create] body:', body);

    const response = await axios.post(
      'https://api.mercadopago.com/v1/payments',
      body,
      {
        headers: {
          Authorization: `Bearer ${effective.mpAccessToken}`,
          'X-Idempotency-Key': idempotencyKey
        }
      }
    );

    const data = response.data;
    const transaction = data.point_of_interaction?.transaction_data || {};
    return res.json({
      id: data.id,
      status: data.status,
      qr_code: transaction.qr_code,
      qr_code_base64: transaction.qr_code_base64,
      ticket_url: transaction.ticket_url,
      tenantId: tenant?.id || null
    });
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    console.error('pix/create ERROR:', status, JSON.stringify(data || error.message, null, 2));
    return res.status(500).json({ error: 'Falha ao criar PIX', details: { status, data } });
  }
});

router.get('/payment/:id', async (req, res) => {
  try {
    const { tenant } = findTenantForRequest(req);
    const effective = resolveEffectiveConfig(tenant);

    if (config.tenants.length > 1 && !tenant) {
      return res.status(400).json({
        error: 'Tenant não reconhecido. Informe o cabeçalho X-Leg-Client.'
      });
    }

    if (!requireMercadoPagoToken(res, effective.mpAccessToken, tenant?.id)) return;

    const { id } = req.params;
    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${id}`,
      { headers: { Authorization: `Bearer ${effective.mpAccessToken}` } }
    );
    const payment = response.data;
    return res.json({
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      tenantId: tenant?.id || null
    });
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    console.error('payment/status ERROR:', status, data || error.message);
    return res.status(500).json({ error: 'Falha ao consultar pagamento', details: { status, data } });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const queryTenantId = normalizeString(pickFirst(req.query?.tenantId));
    const tenantFromQuery = queryTenantId ? findTenantById(queryTenantId) : null;
    const effective = resolveEffectiveConfig(tenantFromQuery);

    if (!effective.mpAccessToken) {
      console.error('webhook ERROR: MP_ACCESS_TOKEN ausente para o tenant', queryTenantId || '(padrão)');
      return res.status(200).send('ok');
    }

    const topic = req.query.topic || req.body?.type;
    const paymentId = req.query.id || req.body?.data?.id;

    console.log('[webhook] topic:', topic, 'paymentId:', paymentId, 'tenant:', tenantFromQuery?.id || null);

    if (topic !== 'payment' || !paymentId) {
      return res.status(200).send('ignored');
    }

    const paymentResponse = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${effective.mpAccessToken}` } }
    );

    const payment = paymentResponse.data;
    const metadata = payment.metadata || {};
    const metadataTenantId = normalizeString(
      metadata.tenantId || metadata.clientId || metadata.cfcId || queryTenantId
    );
    const tenant = metadataTenantId ? findTenantById(metadataTenantId) || tenantFromQuery : tenantFromQuery;

    const targetTenant = tenant || (config.tenants.length === 1 ? config.tenants[0] : null);

    if (config.tenants.length > 1 && !targetTenant) {
      console.warn('[webhook] tenant não identificado para pagamento', paymentId, metadata);
      return res.status(200).send('ok');
    }

    const isApproved = payment.status === 'approved';
    const isBRL = payment.currency_id === 'BRL';
    const amount = payment.transaction_amount;

    if (isApproved && isBRL && (metadata?.email || metadata?.uid) && amount >= (metadata.amount || 0)) {
      const purchase = {
        id: payment.id,
        amount,
        method: payment.payment_method_id,
        dateApproved: payment.date_approved,
        tenantId: targetTenant?.id || null
      };
      if (metadata.email) {
        await activateProByEmail(metadata.email, purchase, { tenant: targetTenant });
      }
      if (metadata.uid) {
        await activateProLegacyUser(metadata.uid, purchase, { tenant: targetTenant });
      }
    } else {
      console.warn('[webhook] pagamento não aprovado/ inválido:', {
        status: payment.status,
        currency_id: payment.currency_id,
        amount,
        metadata
      });
    }

    return res.status(200).send('ok');
  } catch (error) {
    console.error('webhook ERROR:', error.response?.status, error.response?.data || error.message);
    return res.status(200).send('ok');
  }
});

export default router;
