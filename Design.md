# Nexus Collection Builder — Design Guide

## 1. Direção Visual

A interface deve seguir uma estética inspirada no visual da Nexus Mods, usando uma base escura, sólida e funcional, com foco em clareza, organização e hierarquia visual.

O design deve parecer uma aplicação web moderna para criação e publicação de collections, mantendo aparência profissional, compacta e próxima de ferramentas reais de gerenciamento de mods.

A interface **não deve usar barra superior global** com menus como Games, Mods, Collections, Media, Community ou Support.
A navegação principal da aplicação deve ser feita apenas pelo fluxo interno de etapas.

---

## 2. Regras Principais

### Obrigatório

* Usar tema escuro.
* Usar laranja como cor principal de destaque.
* Manter visual próximo ao ecossistema Nexus Mods.
* Priorizar cards, painéis e listas com bordas sutis.
* Usar espaçamento consistente.
* Usar tipografia limpa, compacta e legível.
* Usar ícones simples e funcionais.
* Cada tela deve ser individual, sem collage.
* A interface deve parecer um produto real, não apenas um mockup decorativo.

### Proibido

* Não usar barra superior global.
* Não usar gradientes.
* Não usar roxo como cor principal.
* Não usar brilho exagerado.
* Não usar efeitos glassmorphism.
* Não usar sombras fortes ou coloridas.
* Não usar fundos com textura pesada.
* Não copiar exatamente a UI da Nexus Mods.
* Não usar artes oficiais de jogos/mods diretamente.

---

## 3. Cores

A interface deve usar apenas cores sólidas.

### Background

```css
--color-bg: #0f1216;
--color-bg-secondary: #15191f;
--color-panel: #1b2027;
--color-panel-hover: #20262e;
--color-panel-active: #242a33;
```

### Bordas

```css
--color-border: #2b323c;
--color-border-strong: #3a4350;
--color-border-active: #f28c28;
```

### Texto

```css
--color-text-primary: #f2f4f7;
--color-text-secondary: #b7bec8;
--color-text-muted: #7f8894;
```

### Acento Nexus

```css
--color-accent: #f28c28;
--color-accent-hover: #ff9b38;
--color-accent-active: #d97818;
```

### Status

```css
--color-success: #4caf6a;
--color-warning: #f2b84b;
--color-danger: #ef5350;
```

---

## 4. Background

O fundo principal deve ser uma cor sólida escura.

```css
body {
  background: #0f1216;
}
```

Não usar:

```css
background: linear-gradient(...);
```

Não usar efeitos de iluminação radial, glow ou blur no fundo.

---

## 5. Estrutura Geral da Página

Como a aplicação não deve ter barra superior, a tela deve começar diretamente com a área da aplicação.

Estrutura recomendada:

```txt
[App Container]
  [Header interno da aplicação]
    Logo / Nome da aplicação
    Ações secundárias opcionais

  [Stepper / Fluxo de etapas]

  [Main Content Panel]
    Conteúdo da tela atual
```

---

## 6. Header Interno

O header interno substitui a barra superior global.

Ele deve conter apenas:

* Logo ou ícone da aplicação.
* Nome: Nexus Collection Builder.
* Opcionalmente uma ação secundária discreta, como Configurações ou Sair.

Não deve conter navegação externa.

Exemplo visual:

```txt
[Nexus Collection Builder]                         [Configurações]
```

Estilo:

```css
.app-header {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #2b323c;
  background: #0f1216;
}
```

---

## 7. Stepper

O stepper é a navegação principal da aplicação.

Etapas:

1. API Key
2. Escolher Jogo
3. Buscar Mods
4. Detalhes do Mod
5. Selecionar Arquivo
6. Minha Collection
7. Publicar Collection
8. Collection Publicada

O stepper deve ser horizontal em desktop.

Estilo:

```css
.stepper {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 0;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #b7bec8;
}

.step-number {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #242a33;
  border: 1px solid #3a4350;
  color: #f2f4f7;
}

.step.active .step-number {
  background: #f28c28;
  border-color: #f28c28;
  color: #111318;
}

.step.active {
  color: #f2f4f7;
}
```

Sem gradiente no step ativo.

---

## 8. Painéis

Os painéis devem usar fundo sólido e borda sutil.

```css
.panel {
  background: #1b2027;
  border: 1px solid #2b323c;
  border-radius: 8px;
  padding: 32px;
}
```

Não usar:

```css
background: linear-gradient(...);
backdrop-filter: blur(...);
box-shadow: 0 0 40px rgba(...);
```

Sombras permitidas apenas de forma discreta:

```css
box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
```

---

## 9. Botões

### Botão Primário

```css
.button-primary {
  background: #f28c28;
  color: #111318;
  border: 1px solid #f28c28;
  border-radius: 6px;
  font-weight: 700;
}
```

Hover:

```css
.button-primary:hover {
  background: #ff9b38;
  border-color: #ff9b38;
}
```

### Botão Secundário

```css
.button-secondary {
  background: #20262e;
  color: #f2f4f7;
  border: 1px solid #3a4350;
  border-radius: 6px;
}
```

---

## 10. Inputs

```css
.input {
  background: #11151a;
  border: 1px solid #2b323c;
  color: #f2f4f7;
  border-radius: 6px;
  height: 44px;
  padding: 0 14px;
}
```

Estado focado:

```css
.input:focus {
  border-color: #f28c28;
  outline: none;
}
```

Não usar glow forte no focus.

---

## 11. Cards de Mods

Os cards devem ser horizontais, compactos e funcionais.

Estrutura:

```txt
[Thumbnail] [Título]
            [Autor]
            [Descrição]
            [Stats]
                                      [+]
```

Estilo:

```css
.mod-card {
  display: flex;
  background: #1b2027;
  border: 1px solid #2b323c;
  border-radius: 8px;
  overflow: hidden;
}

.mod-card:hover {
  background: #20262e;
  border-color: #3a4350;
}
```

O botão de adicionar deve ser laranja sólido.

---

## 12. Listas da Collection

A tela “Minha Collection” deve usar linhas compactas.

Cada linha deve conter:

* Drag handle.
* Thumbnail.
* Nome do mod.
* Arquivo / versão.
* Tamanho.
* Status.
* Menu de ações.

Status:

```css
.status-ok {
  color: #4caf6a;
}

.status-warning {
  color: #f2b84b;
}

.status-error {
  color: #ef5350;
}
```

---

## 13. Tipografia

Usar uma fonte sans-serif moderna.

Sugestões:

```css
font-family: Inter, Roboto, Arial, sans-serif;
```

Títulos principais:

```css
.page-title {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #f2f4f7;
}
```

Subtítulos:

```css
.page-subtitle {
  font-size: 15px;
  color: #b7bec8;
}
```

Texto comum:

```css
body {
  font-size: 14px;
  color: #f2f4f7;
}
```

---

## 14. Imagens

As imagens dos jogos e mods devem parecer artes genéricas inspiradas no gênero, sem copiar artes oficiais.

Direção:

* Skyrim-like: fantasia nórdica, montanhas, armaduras.
* Fallout-like: pós-apocalipse, ruínas, deserto.
* Stardew-like: fazenda pixel art genérica.
* Cyberpunk-like: cidade neon futurista.
* RPG fantasy: grupo de aventureiros, magia, monstros.
* The Witcher-like: caçador medieval em cenário sombrio.

---

## 15. Telas

### 1. API Key

Tela de entrada com:

* Título.
* Texto explicativo.
* Campo de API Key.
* Botão “Validar API Key”.
* Box de segurança.

Sem barra superior global.

---

### 2. Escolher Jogo

Tela com:

* Campo de busca.
* Grid de jogos.
* Cards grandes.
* Botão “Ver todos os jogos”.

---

### 3. Buscar Mods

Tela com:

* Campo de busca.
* Filtros.
* Lista de resultados.
* Botão de adicionar mod.
* Paginação.

---

### 4. Detalhes do Mod

Tela com:

* Imagem hero do mod.
* Nome do mod.
* Autor.
* Estatísticas.
* Categorias.
* Descrição.
* Tabs de conteúdo.
* Botão “Adicionar à Collection”.

---

### 5. Selecionar Arquivo

Tela com:

* Resumo do mod.
* Lista de arquivos.
* Radio selection.
* Main Files.
* Optional Files.
* Old Files.
* Botão “Adicionar à Collection”.

---

### 6. Minha Collection

Tela com:

* Lista dos mods selecionados.
* Status de cada item.
* Reordenação por drag.
* Filtros.
* Ordenação.
* Salvar rascunho.

---

### 7. Publicar Collection

Tela com formulário:

* Título.
* Descrição.
* Categoria.
* Visibilidade.
* Imagem de capa.
* Salvar rascunho.
* Publicar Collection.

---

### 8. Collection Publicada

Tela de sucesso com:

* Ícone de check.
* Mensagem de sucesso.
* Card resumo da collection.
* Link copiável.
* Botões “Ver Collection” e “Nova Collection”.

---

## 16. Regra Final de Estilo

A interface deve ser escura, sólida, limpa e objetiva.

Ela deve parecer uma ferramenta oficial de criação de collections, com visual próximo ao ecossistema Nexus Mods, mas sem copiar diretamente sua interface.

Todas as superfícies devem usar cores sólidas.
Não utilizar gradientes em nenhum ponto da interface.
