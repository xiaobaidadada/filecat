# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English ](./doc/EN_README.md)
- 中文 | [中文 ](./doc/ZN_README.md)
- Use uma interface bonita baseada no [filebrowser](https://github.com/filebrowser/filebrowser) para gerenciar arquivos, com funcionalidades adicionais de administração de servidores.
- Instale com `npm install filecat -g` e execute `filecat`, adicione o parâmetro `filecat --help` para mais detalhes. Também é possível executar diretamente com o binário. Mais opções de uso podem ser encontradas abaixo.

## Capturas de tela
![Exibição](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## Uso
### Experimente
URL: http://116.198.245.137:5569/
Nome de usuário e senha: `admin`/`admin`. Não há sistema de permissões no momento, então não altere a senha para não afetar a experiência de outros usuários.

### Execução via npm
- Se seu servidor já tiver o Node e o npm instalados, use `npm install filecat -g` para instalar globalmente e depois execute o comando `filecat`. Ou instale com `npm install filecat` para usar dentro do projeto e execute com `npx filecat`.
- Se você tiver problemas com a rede, pode usar o espelho do npm da Taobao: `npm config set registry https://registry.npmmirror.com`, ou instale temporariamente com o espelho: `npm install -g filecat --registry https://registry.npmmirror.com`.

### Execução via binário
O código mais recente não é diretamente empacotado. Para usar os recursos mais recentes e correções de bugs, você precisará empacotar o código por conta própria. 
Baixe a [última versão estável](https://github.com/xiaobaidadada/filecat/releases) e execute o arquivo binário para seu sistema (x64):
1. Execute o comando `filecat --port 5567 --base_folder d:/`. Sem definir o nome de usuário, o padrão de login será admin.
2. Use o arquivo de configuração do exemplo e execute com `filecat --env ./env`. No Linux, pode ser necessário executar `sudo chmod +x ./filecat-linux` para obter permissões de execução.
3. Caso o binário não execute, faça a compilação do código ou use uma versão não empacotada (as funcionalidades de rede ainda não são suportadas em todos os ambientes).

### Instalação no Linux via systemd
A instalação no systemd permite que o filecat seja executado como um processo em segundo plano. Requer privilégios de root. Recomenda-se esta instalação em sistemas Linux. Após baixar a versão mais recente do arquivo binário `filecat-linux`, dê permissão de execução e execute `./filecat-linux --install linux`. Se você usou o npm, pode executar diretamente `filecat --install linux` para instalá-lo no systemd.

### Desenvolvimento
- Atualmente, a instalação direta no macOS pode falhar (não foi testado). Você pode usar `npm install --ignore-scripts` como alternativa.
- Este projeto utiliza dependências pré-compiladas para evitar a necessidade de compilação no momento da instalação. Caso tenha problemas de rede, o sistema tentará compilar as dependências manualmente. Se estiver no Windows e encontrar problemas durante a compilação, consulte [este link](https://blog.csdn.net/jjocwc/article/details/134152602) para mais informações.

## Funcionalidades principais
- Gerenciamento de arquivos
  1. Pré-visualização de imagens, vídeos, markdown, entre outros formatos.
  2. Editor de código, com várias opções de visualização de arquivos.
  3. Editor de imagens integrado, que pode ser acessado ao clicar com o botão direito em uma imagem.
  4. Editor de estilo "studio", semelhante ao VSCode, que pode ser utilizado como ambiente de desenvolvimento temporário no Linux.
  5. Editor de diagramas com [excalidraw](https://github.com/excalidraw/excalidraw), uma excelente ferramenta de quadro branco.
  6. Troca de diretórios raiz, permitindo a navegação por múltiplas pastas em uma única sessão.
  7. Terminal integrado, permitindo navegar pelos diretórios do servidor em tempo real.

- Suporte a proxies SSH, FTP e gerenciamento de múltiplos servidores Linux, facilitando a administração.
- Coletânea de sites como favoritos, podendo ser usados para salvar links úteis no servidor.
- Funcionalidades adicionais como DDNS, proxy HTTP, RDP (controle remoto de Windows), player RTSP para streaming, gerenciamento de containers Docker, monitoramento de sistema (memória, CPU e processos) e gerenciamento do systemd no Linux.
- Funcionalidade Wake-on-LAN (WOL) para ligar dispositivos remotamente.
- Redes virtuais para implementação de P2P e VPN, utilizando tunelamento virtual de IPs na máquina host.

## Observações
1. Algumas funcionalidades não estão disponíveis no macOS (como redes virtuais), e em sistemas Windows, as funcionalidades precisam ser executadas no modo administrador. No Linux, são necessários privilégios de root para utilizar algumas funcionalidades.
2. Algumas funcionalidades estão ainda em fase de demonstração e serão aprimoradas futuramente.

## Roteiro de desenvolvimento
1. Aperfeiçoar detalhes de operação.
2. Adicionar suporte para mais formatos de arquivos.
3. Melhorar as funcionalidades de streaming e mídia.
4. Adicionar suporte a mais plataformas de DDNS.
5. Implementar funcionalidades de web scraping automatizadas.
6. Implementar controle de permissões de rotas.

## Agradecimentos
Este projeto utiliza ou baseia-se em funcionalidades de projetos como:
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
