Certificado e chave **sintéticos, públicos, autoassinados**, exclusivamente para testes locais.
Não são ICP-Brasil, não identificam uma empresa real e não autorizam emissão fiscal.
O CNPJ no otherName é somente um documento de exemplo com dígitos válidos.
Não reutilizar estes arquivos em ambientes com dados reais.

Os arquivos `test-server-*` são a identidade TLS sintética do servidor local.
O teste mTLS usa um processo separado com essa CA em `NODE_EXTRA_CA_CERTS`;
nenhuma verificação TLS é desativada no código ou no teste.
