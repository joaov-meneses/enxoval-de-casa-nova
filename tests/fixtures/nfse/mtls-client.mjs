// Cliente de teste em processo separado para carregar uma CA sintética com NODE_EXTRA_CA_CERTS.
import { fiscalConfig, nationalRequest } from '../../../server/fiscal/provider.ts';
const response=await nationalRequest({...fiscalConfig(),baseUrl:process.argv[2]},'/probe');
if (!response.authenticated) throw new Error('mTLS não autenticou o cliente');
console.log('authenticated');
