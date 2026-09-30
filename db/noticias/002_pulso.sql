-- Pulso oficial (publicaciones de SENIAT, BCV y SAREN en el hero): retirado el 30/09/2026 y reemplazado por
-- "El día en cifras", que usa solo datos propios (docs/21). Se borran sus tablas si llegaron a crearse.
SET client_min_messages = warning;
DROP TABLE IF EXISTS noticias.pulso_publicacion;
DROP TABLE IF EXISTS noticias.pulso_cuenta;
