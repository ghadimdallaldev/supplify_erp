#!/usr/bin/env node
/**
 * Register Supplify custom domains on Railway and print DNS records for GoDaddy.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ID = '745872f2-9149-452f-99e9-9af97704705b';

const DOMAINS = [
  {
    env: 'development',
    environmentId: '31f40302-dfd1-4d8e-b25a-bdcc794174d7',
    serviceId: 'e8158ff7-35dc-4f38-9163-6b94d14dd499',
    service: 'supplify-web-dev',
    domain: 'app-dev.supplifyerp.com',
  },
  {
    env: 'development',
    environmentId: '31f40302-dfd1-4d8e-b25a-bdcc794174d7',
    serviceId: '84b7bcdb-f5c9-4bfc-ac86-1ae9113672ce',
    service: 'supplify-api-dev',
    domain: 'api-dev.supplifyerp.com',
  },
  {
    env: 'development',
    environmentId: '31f40302-dfd1-4d8e-b25a-bdcc794174d7',
    serviceId: 'e42456ad-a51c-4a8e-a9d6-718d15527ca0',
    service: 'keycloak',
    domain: 'keycloak-dev.supplifyerp.com',
  },
  {
    env: 'preprod',
    environmentId: '4914bd75-3288-459a-ae9a-4dcdf5593d49',
    serviceId: '9da0ec97-0e28-4c33-92f0-57182f7cd884',
    service: 'supplify-web-preprod',
    domain: 'app-preprod.supplifyerp.com',
  },
  {
    env: 'preprod',
    environmentId: '4914bd75-3288-459a-ae9a-4dcdf5593d49',
    serviceId: '0efcfe8e-df71-4dd1-b2d5-5a81c88d2904',
    service: 'supplify-api-preprod',
    domain: 'api-preprod.supplifyerp.com',
  },
  {
    env: 'preprod',
    environmentId: '4914bd75-3288-459a-ae9a-4dcdf5593d49',
    serviceId: '7d24dab5-57f4-4dbf-9609-12b3b2b29ba2',
    service: 'keycloak-preprod',
    domain: 'keycloak-preprod.supplifyerp.com',
  },
  {
    env: 'production',
    environmentId: '75074755-9b3b-4f18-9e48-6fa2957f1d8b',
    serviceId: '7911e104-9093-472b-ab68-f29026b3d790',
    service: 'supplify-web-prod',
    domain: 'app.supplifyerp.com',
  },
  {
    env: 'production',
    environmentId: '75074755-9b3b-4f18-9e48-6fa2957f1d8b',
    serviceId: 'c384fd8a-a6c5-4851-a2e8-623b7dbeba81',
    service: 'supplify-api-prod',
    domain: 'api.supplifyerp.com',
  },
  {
    env: 'production',
    environmentId: '75074755-9b3b-4f18-9e48-6fa2957f1d8b',
    serviceId: '2745e741-1f54-4e31-846a-25d7790c26f4',
    service: 'keycloak-prod',
    domain: 'keycloak.supplifyerp.com',
  },
];

const MUTATION = `mutation Create($projectId: String!, $environmentId: String!, $serviceId: String!, $domain: String!) {
  customDomainCreate(input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, domain: $domain }) {
    id
    domain
    status {
      dnsRecords { hostlabel requiredValue status }
      verificationToken
      certificateStatus
    }
  }
}`;

const QUERY_EXISTING = `query Domains($projectId: String!, $serviceId: String!, $environmentId: String!) {
  domains(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) {
    customDomains { id domain status { dnsRecords { hostlabel requiredValue status } verificationToken certificateStatus } }
  }
}`;

function getToken() {
  const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf8'));
  const token = cfg.user?.accessToken;
  if (!token) throw new Error('Not logged in — run railway login');
  return token;
}

async function gql(query, variables) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

async function ensureDomain(entry) {
  const existingData = await gql(QUERY_EXISTING, {
    projectId: PROJECT_ID,
    serviceId: entry.serviceId,
    environmentId: entry.environmentId,
  });
  const existing = existingData.domains?.customDomains?.find((d) => d.domain === entry.domain);
  if (existing) return { entry, created: false, ...existing };

  const data = await gql(MUTATION, {
    projectId: PROJECT_ID,
    environmentId: entry.environmentId,
    serviceId: entry.serviceId,
    domain: entry.domain,
  });
  return { entry, created: true, ...data.customDomainCreate };
}

async function main() {
  const results = [];
  for (const entry of DOMAINS) {
    process.stderr.write(`Registering ${entry.domain}…\n`);
    results.push(await ensureDomain(entry));
  }

  console.log('\n=== DNS records for GoDaddy (fix CNAME targets + add TXT) ===\n');
  for (const r of results) {
    const host = r.domain.replace('.supplifyerp.com', '');
    const cname = r.status?.dnsRecords?.[0];
    console.log(`${r.entry.env} / ${r.entry.service}`);
    console.log(`  Domain: ${r.domain}`);
    console.log(`  CNAME  ${cname?.hostlabel ?? host} → ${cname?.requiredValue ?? '?'}`);
    console.log(`  TXT    _railway-verify.${cname?.hostlabel ?? host} → ${r.status?.verificationToken ?? '?'}`);
    console.log(`  Cert:   ${r.status?.certificateStatus ?? 'unknown'}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
