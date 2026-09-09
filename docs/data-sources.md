# Fontes de dados

Registro das fontes de dados utilizadas pelo Kotoba, conforme os dados preservados no banco
(ver `source_imports` em `packages/database/src/schema.ts`).

## JMdict

| Campo                 | Valor                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nome da fonte         | JMdict (Japanese-Multilingual Dictionary) / JMdict-EDICT Dictionary Project                                                                          |
| Finalidade            | Dicionário japonês multilíngue em XML, usado como dados lexicais principais (entradas, kanji, leituras, acepções e traduções)                        |
| Licença               | Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)                                                                                           |
| URL oficial           | <https://www.edrdg.org/jmdict/j_jmdict.html>                                                                                                         |
| Download              | <https://ftp.edrdg.org/pub/Nihongo/JMdict.gz>                                                                                                        |
| Mantenedor            | Electronic Dictionary Research and Development Group (EDRDG), originalmente coordenado por Jim Breen (Monash University)                             |
| Atribuição necessária | Atribuir o trabalho a Jim Breen e ao Electronic Dictionary Research and Development Group, com link para o projeto JMdict (<https://www.edrdg.org/>) |
| Versão utilizada      | Registrada em tempo de importação (`jmdictRevision`/`fileVersion` do cabeçalho do arquivo, na tabela `source_imports.version`)                       |
| Data da importação    | Registrada em `source_imports.imported_at` para cada execução do importer                                                                            |

### Responsabilidade dos dados

Os dados do JMdict pertencem à EDRDG e **não são propriedade do Kotoba**. Qualquer
distribuição do banco derivado deve:

- manter a atribuição exigida pela licença CC BY-SA 4.0;
- distribuir sob a mesma licença (Share-Alike) as alterações realizadas sobre os dados;
- mencionar a fonte no produto final, não apenas na documentação.

### Preservação das informações originais

O importer preserva no banco os identificadores e metadados relevantes do JMdict:

| JMdict                                                  | Kotoba (tabela/coluna)                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `ent_seq`                                               | `entries.jmdict_seq`                                             |
| `keb` / `ke_inf` / `ke_pri`                             | `kanji_forms.(text / infos / priorities)`                        |
| `reb` / `re_nokanji` / `re_restr` / `re_inf` / `re_pri` | `readings.(text / no_kanji / restrictions / infos / priorities)` |
| `stagk` / `stagr`                                       | `senses.(kanji_restrictions / reading_restrictions)`             |
| `pos` / `field` / `misc` / `dial`                       | `senses.(part_of_speech / fields / misc / dialects)`             |
| `gloss` + `xml:lang`                                    | `glosses.(text / language)`                                      |
| Ordem dos elementos                                     | colunas `position` em cada tabela                                |

### Dados ainda não importados (evolução futura)

Os seguintes elementos do JMdict não são armazenados nesta versão do importer, sem perda para
o escopo atual:

- `lsource` (idioma fonte dos empréstimos — não é tradução propriamente);
- `xref` e `ant` (referências cruzadas e antônimos entre entradas);
- `s_inf` (informações suplementares da acepção).

## Outras fontes

Nenhuma outra fonte externa é utilizada nesta versão. O dataset de desenvolvimento
(`packages/database/src/seed/data.ts`) é um subconjunto curado do próprio JMdict e não
substitui a fonte original.
