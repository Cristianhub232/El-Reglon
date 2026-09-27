-- =============================================================================
-- El Renglón · Módulo RIF · Validación del Registro Único de Información Fiscal
-- Formato: letra + 8 dígitos + dígito verificador (p. ej. J-00002961-0).
-- Dígito verificador (módulo 11): prefijo (V=1, E=2, J=3, P=4, G=5) × 4 y los 8 dígitos por
-- 3,2,7,6,5,4,3,2; dv = 11 − (suma mod 11), y 0 si el resultado es 10 u 11.
-- Verificado con RIF públicos: J-00002961-0, G-20000303-0, J-07013380-5.
-- El prefijo C (comunas y consejos comunales) se acepta sin verificar el dígito: su valor
-- en el algoritmo no está confirmado.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS rif;

CREATE OR REPLACE FUNCTION rif.validar(p_rif text)
RETURNS TABLE (valido boolean, rif text, rif_formateado text, prefijo char(1), tipo_persona text,
               terminal smallint, digito_verificado boolean, mensaje text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    n text := upper(regexp_replace(coalesce(p_rif, ''), '[\s\-\.]', '', 'g'));
    pesos int[] := ARRAY[3, 2, 7, 6, 5, 4, 3, 2];
    valor_prefijo int;
    suma int;
    dv int;
BEGIN
    IF n !~ '^[VEJPGC][0-9]{9}$' THEN
        RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::char(1), NULL::text, NULL::smallint, false,
            'Formato inválido: se espera una letra (V, E, J, P, G o C) y 9 dígitos, p. ej. J-00002961-0';
        RETURN;
    END IF;
    valor_prefijo := CASE substr(n, 1, 1) WHEN 'V' THEN 1 WHEN 'E' THEN 2 WHEN 'J' THEN 3 WHEN 'P' THEN 4 WHEN 'G' THEN 5 END;
    rif := n;
    rif_formateado := substr(n, 1, 1) || '-' || substr(n, 2, 8) || '-' || substr(n, 10, 1);
    prefijo := substr(n, 1, 1);
    tipo_persona := CASE prefijo WHEN 'V' THEN 'Persona natural venezolana' WHEN 'E' THEN 'Persona natural extranjera'
                    WHEN 'J' THEN 'Persona jurídica' WHEN 'P' THEN 'Pasaporte' WHEN 'G' THEN 'Ente gubernamental'
                    WHEN 'C' THEN 'Comuna o consejo comunal' END;
    terminal := substr(n, 10, 1)::smallint;
    IF valor_prefijo IS NULL THEN
        valido := true; digito_verificado := false;
        mensaje := 'Formato válido; dígito verificador no comprobado para el prefijo C';
        RETURN NEXT; RETURN;
    END IF;
    suma := valor_prefijo * 4;
    FOR i IN 1..8 LOOP
        suma := suma + substr(n, i + 1, 1)::int * pesos[i];
    END LOOP;
    dv := 11 - (suma % 11);
    IF dv >= 10 THEN dv := 0; END IF;
    digito_verificado := true;
    valido := (dv = terminal);
    mensaje := CASE WHEN valido THEN 'RIF válido' ELSE 'Dígito verificador incorrecto: se esperaba ' || dv END;
    RETURN NEXT;
END $$;
