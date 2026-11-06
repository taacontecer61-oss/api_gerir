-- Garante exclusividade entre notícia em destaque (featured) e notícias secundárias (highlight).
-- Artigos que tinham ambas as flags passam a ficar apenas em destaque.
UPDATE `articles`
SET `highlight` = 0
WHERE `featured` = 1 AND `highlight` = 1 AND `deleted_at` IS NULL;
