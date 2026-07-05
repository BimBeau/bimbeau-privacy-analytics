<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Licensing helpers for Freemius-based plan checks.
 *
 */

/**
 * Retrieve the Freemius instance when available.
 */
function bbpa_get_freemius_instance(): ?object
{
    if (!function_exists('bbpa_fs')) {
        return null;
    }

    $freemius = bbpa_fs();
    if (!is_object($freemius)) {
        return null;
    }

    return $freemius;
}


/**
 * Returns the upgrade URL for Freemius pricing and upgrade flows.
 */
function bbpa_get_upgrade_url(): string
{
    $fallback = admin_url('admin.php?page=' . BBPA_SLUG . '-pricing');
    $freemius = bbpa_get_freemius_instance();

    if (null === $freemius || !method_exists($freemius, 'get_upgrade_url')) {
        return (string) apply_filters('bbpa_upgrade_url', $fallback);
    }

    $upgrade_url = (string) $freemius->get_upgrade_url();
    if ($upgrade_url === '') {
        $upgrade_url = $fallback;
    }

    return (string) apply_filters('bbpa_upgrade_url', $upgrade_url);
}

/**
 * Return the Freemius checkout language matching the current WordPress user locale.
 */
function bbpa_get_freemius_checkout_language(): string
{
    $locale = function_exists('get_user_locale') ? get_user_locale() : get_locale();
    $language = strtolower(substr((string) $locale, 0, 2));

    return in_array($language, ['de', 'es', 'fr', 'it', 'nl'], true) ? $language : 'auto';
}

/**
 * Add BimBeau Privacy Analytics checkout parameters without editing Freemius vendor templates.
 */
function bbpa_filter_freemius_checkout_parameters(array $parameters): array
{
    if (empty($parameters['language'])) {
        $parameters['language'] = bbpa_get_freemius_checkout_language();
    }

    return $parameters;
}

/**
 * Return the pricing page i18n payload used by the BimBeau Privacy Analytics admin-side adapter.
 */
function bbpa_get_freemius_pricing_i18n_config(): array
{
    $locale = function_exists('get_user_locale') ? get_user_locale() : get_locale();
    $language = strtolower(substr((string) $locale, 0, 2));

    $catalog = [
        'fr' => [
            'Plans and Pricing' => 'Formules et tarifs',
            'Choose your plan and upgrade in minutes!' => 'Choisissez votre formule et passez à la version supérieure en quelques minutes !',
            'Most Popular' => 'Le plus populaire',
            'Free' => 'Gratuit',
            'Annual' => 'Annuel',
            'Monthly' => 'Mensuel',
            'Lifetime' => 'À vie',
            'Billed Annually' => 'Facturé annuellement',
            'Billed Once' => 'Facturé une seule fois',
            'Billed Monthly' => 'Facturé mensuellement',
            'Upgrade Now' => 'Mettre à niveau maintenant',
            'Upgrade' => 'Mettre à niveau',
            'Downgrade' => 'Revenir à une formule inférieure',
            'Your Plan' => 'Votre formule',
            'Cancel' => 'Annuler',
            'Learn More' => 'En savoir plus',
            'Refund Policy' => 'Politique de remboursement',
            'Frequently Asked Questions' => 'Questions fréquentes',
            'No Support' => 'Aucun support',
        ],
        'de' => [
            'Plans and Pricing' => 'Tarife und Preise',
            'Choose your plan and upgrade in minutes!' => 'Wählen Sie Ihren Tarif und upgraden Sie in wenigen Minuten!',
            'Most Popular' => 'Am beliebtesten',
            'Free' => 'Kostenlos',
            'Annual' => 'Jährlich',
            'Monthly' => 'Monatlich',
            'Lifetime' => 'Lebenslang',
            'Billed Annually' => 'Jährlich abgerechnet',
            'Billed Once' => 'Einmalig abgerechnet',
            'Billed Monthly' => 'Monatlich abgerechnet',
            'Upgrade Now' => 'Jetzt upgraden',
            'Upgrade' => 'Upgraden',
            'Downgrade' => 'Downgraden',
            'Your Plan' => 'Ihr Tarif',
            'Cancel' => 'Abbrechen',
            'Learn More' => 'Mehr erfahren',
            'Refund Policy' => 'Rückerstattungsrichtlinie',
            'Frequently Asked Questions' => 'Häufig gestellte Fragen',
            'No Support' => 'Kein Support',
        ],
        'es' => [
            'Plans and Pricing' => 'Planes y precios',
            'Choose your plan and upgrade in minutes!' => 'Elige tu plan y mejora en minutos.',
            'Most Popular' => 'Más popular',
            'Free' => 'Gratis',
            'Annual' => 'Anual',
            'Monthly' => 'Mensual',
            'Lifetime' => 'De por vida',
            'Billed Annually' => 'Facturado anualmente',
            'Billed Once' => 'Facturado una vez',
            'Billed Monthly' => 'Facturado mensualmente',
            'Upgrade Now' => 'Mejorar ahora',
            'Upgrade' => 'Mejorar',
            'Downgrade' => 'Cambiar a un plan inferior',
            'Your Plan' => 'Tu plan',
            'Cancel' => 'Cancelar',
            'Learn More' => 'Más información',
            'Refund Policy' => 'Política de reembolso',
            'Frequently Asked Questions' => 'Preguntas frecuentes',
            'No Support' => 'Sin soporte',
        ],
        'it' => [
            'Plans and Pricing' => 'Piani e prezzi',
            'Choose your plan and upgrade in minutes!' => 'Scegli il piano e fai l’upgrade in pochi minuti!',
            'Most Popular' => 'Più popolare',
            'Free' => 'Gratis',
            'Annual' => 'Annuale',
            'Monthly' => 'Mensile',
            'Lifetime' => 'A vita',
            'Billed Annually' => 'Fatturato annualmente',
            'Billed Once' => 'Fatturato una sola volta',
            'Billed Monthly' => 'Fatturato mensilmente',
            'Upgrade Now' => 'Fai l’upgrade ora',
            'Upgrade' => 'Upgrade',
            'Downgrade' => 'Downgrade',
            'Your Plan' => 'Il tuo piano',
            'Cancel' => 'Annulla',
            'Learn More' => 'Scopri di più',
            'Refund Policy' => 'Politica di rimborso',
            'Frequently Asked Questions' => 'Domande frequenti',
            'No Support' => 'Nessun supporto',
        ],
        'pt' => [
            'Plans and Pricing' => 'Planos e preços',
            'Choose your plan and upgrade in minutes!' => 'Escolha o seu plano e faça o upgrade em minutos!',
            'Most Popular' => 'Mais popular',
            'Free' => 'Grátis',
            'Annual' => 'Anual',
            'Monthly' => 'Mensal',
            'Lifetime' => 'Vitalício',
            'Billed Annually' => 'Faturado anualmente',
            'Billed Once' => 'Faturado uma vez',
            'Billed Monthly' => 'Faturado mensalmente',
            'Upgrade Now' => 'Atualizar agora',
            'Upgrade' => 'Atualizar',
            'Downgrade' => 'Mudar para plano inferior',
            'Your Plan' => 'O seu plano',
            'Cancel' => 'Cancelar',
            'Learn More' => 'Saber mais',
            'Refund Policy' => 'Política de reembolso',
            'Frequently Asked Questions' => 'Perguntas frequentes',
            'No Support' => 'Sem suporte',
        ],
        'tr' => [
            'Plans and Pricing' => 'Planlar ve fiyatlandırma',
            'Choose your plan and upgrade in minutes!' => 'Planınızı seçin ve dakikalar içinde yükseltin!',
            'Most Popular' => 'En popüler',
            'Free' => 'Ücretsiz',
            'Annual' => 'Yıllık',
            'Monthly' => 'Aylık',
            'Lifetime' => 'Ömür boyu',
            'Billed Annually' => 'Yıllık faturalandırılır',
            'Billed Once' => 'Bir kez faturalandırılır',
            'Billed Monthly' => 'Aylık faturalandırılır',
            'Upgrade Now' => 'Şimdi yükselt',
            'Upgrade' => 'Yükselt',
            'Downgrade' => 'Alt plana geç',
            'Your Plan' => 'Planınız',
            'Cancel' => 'İptal',
            'Learn More' => 'Daha fazla bilgi',
            'Refund Policy' => 'Geri ödeme politikası',
            'Frequently Asked Questions' => 'Sık sorulan sorular',
            'No Support' => 'Destek yok',
        ],
        'nl' => [
            'Plans and Pricing' => 'Pakketten en prijzen',
            'Choose your plan and upgrade in minutes!' => 'Kies je pakket en upgrade binnen enkele minuten!',
            'Most Popular' => 'Populairst',
            'Free' => 'Gratis',
            'Annual' => 'Jaarlijks',
            'Monthly' => 'Maandelijks',
            'Lifetime' => 'Levenslang',
            'Billed Annually' => 'Jaarlijks gefactureerd',
            'Billed Once' => 'Eenmalig gefactureerd',
            'Billed Monthly' => 'Maandelijks gefactureerd',
            'Upgrade Now' => 'Nu upgraden',
            'Upgrade' => 'Upgraden',
            'Downgrade' => 'Downgraden',
            'Your Plan' => 'Je pakket',
            'Cancel' => 'Annuleren',
            'Learn More' => 'Meer informatie',
            'Refund Policy' => 'Restitutiebeleid',
            'Frequently Asked Questions' => 'Veelgestelde vragen',
            'No Support' => 'Geen ondersteuning',
        ],
        'sv' => [
            'Plans and Pricing' => 'Planer och priser',
            'Choose your plan and upgrade in minutes!' => 'Välj din plan och uppgradera på några minuter!',
            'Most Popular' => 'Mest populär',
            'Free' => 'Gratis',
            'Annual' => 'Årlig',
            'Monthly' => 'Månadsvis',
            'Lifetime' => 'Livstid',
            'Billed Annually' => 'Faktureras årligen',
            'Billed Once' => 'Faktureras en gång',
            'Billed Monthly' => 'Faktureras månadsvis',
            'Upgrade Now' => 'Uppgradera nu',
            'Upgrade' => 'Uppgradera',
            'Downgrade' => 'Nedgradera',
            'Your Plan' => 'Din plan',
            'Cancel' => 'Avbryt',
            'Learn More' => 'Läs mer',
            'Refund Policy' => 'Återbetalningspolicy',
            'Frequently Asked Questions' => 'Vanliga frågor',
            'No Support' => 'Ingen support',
        ],
        'da' => [
            'Plans and Pricing' => 'Planer og priser',
            'Choose your plan and upgrade in minutes!' => 'Vælg din plan og opgrader på få minutter!',
            'Most Popular' => 'Mest populær',
            'Free' => 'Gratis',
            'Annual' => 'Årlig',
            'Monthly' => 'Månedlig',
            'Lifetime' => 'Livstid',
            'Billed Annually' => 'Faktureres årligt',
            'Billed Once' => 'Faktureres én gang',
            'Billed Monthly' => 'Faktureres månedligt',
            'Upgrade Now' => 'Opgrader nu',
            'Upgrade' => 'Opgrader',
            'Downgrade' => 'Nedgrader',
            'Your Plan' => 'Din plan',
            'Cancel' => 'Annuller',
            'Learn More' => 'Læs mere',
            'Refund Policy' => 'Refusionspolitik',
            'Frequently Asked Questions' => 'Ofte stillede spørgsmål',
            'No Support' => 'Ingen support',
        ],
        'el' => [
            'Plans and Pricing' => 'Πλάνα και τιμές',
            'Choose your plan and upgrade in minutes!' => 'Επιλέξτε το πλάνο σας και αναβαθμίστε σε λίγα λεπτά!',
            'Most Popular' => 'Πιο δημοφιλές',
            'Free' => 'Δωρεάν',
            'Annual' => 'Ετήσιο',
            'Monthly' => 'Μηνιαίο',
            'Lifetime' => 'Εφ’ όρου ζωής',
            'Billed Annually' => 'Χρέωση ετησίως',
            'Billed Once' => 'Εφάπαξ χρέωση',
            'Billed Monthly' => 'Χρέωση μηνιαίως',
            'Upgrade Now' => 'Αναβάθμιση τώρα',
            'Upgrade' => 'Αναβάθμιση',
            'Downgrade' => 'Υποβάθμιση',
            'Your Plan' => 'Το πλάνο σας',
            'Cancel' => 'Ακύρωση',
            'Learn More' => 'Μάθετε περισσότερα',
            'Refund Policy' => 'Πολιτική επιστροφών',
            'Frequently Asked Questions' => 'Συχνές ερωτήσεις',
            'No Support' => 'Χωρίς υποστήριξη',
        ],
    ];

    $patterns = [
        ['pattern' => '^Save up to ([0-9]+)% on Yearly Pricing!$', 'replacement' => [
            'fr' => 'Économisez jusqu’à $1 % sur la facturation annuelle !',
            'de' => 'Sparen Sie bis zu $1 % bei jährlicher Abrechnung!',
            'es' => '¡Ahorra hasta un $1 % en la facturación anual!',
            'it' => 'Risparmia fino al $1 % sulla fatturazione annuale!',
            'pt' => 'Poupe até $1 % na faturação anual!',
            'tr' => 'Yıllık fiyatlandırmada %$1 kadar tasarruf edin!',
            'nl' => 'Bespaar tot $1 % op jaarlijkse prijzen!',
            'sv' => 'Spara upp till $1 % på årsbetalning!',
            'da' => 'Spar op til $1 % på årlig betaling!',
            'el' => 'Εξοικονομήστε έως $1 % στην ετήσια τιμολόγηση!',
        ]],
        ['pattern' => '^Selected Plan: (.+)$', 'replacement' => [
            'fr' => 'Formule sélectionnée : $1',
            'de' => 'Ausgewählter Tarif: $1',
            'es' => 'Plan seleccionado: $1',
            'it' => 'Piano selezionato: $1',
            'pt' => 'Plano selecionado: $1',
            'tr' => 'Seçilen plan: $1',
            'nl' => 'Geselecteerd pakket: $1',
            'sv' => 'Vald plan: $1',
            'da' => 'Valgt plan: $1',
            'el' => 'Επιλεγμένο πλάνο: $1',
        ]],
        ['pattern' => '^All (.+) Features$', 'replacement' => [
            'fr' => 'Toutes les fonctionnalités $1',
            'de' => 'Alle Funktionen von $1',
            'es' => 'Todas las funciones de $1',
            'it' => 'Tutte le funzionalità di $1',
            'pt' => 'Todas as funcionalidades de $1',
            'tr' => 'Tüm $1 özellikleri',
            'nl' => 'Alle functies van $1',
            'sv' => 'Alla funktioner i $1',
            'da' => 'Alle funktioner i $1',
            'el' => 'Όλες οι λειτουργίες του $1',
        ]],
    ];

    return [
        'checkoutLanguage' => bbpa_get_freemius_checkout_language(),
        'strings' => $catalog[$language] ?? [],
        'patterns' => array_map(
            static function (array $pattern) use ($language): array {
                return [
                    'pattern' => $pattern['pattern'],
                    'replacement' => $pattern['replacement'][$language] ?? '',
                ];
            },
            $patterns
        ),
    ];
}

/**
 * Enqueue the BimBeau Privacy Analytics Freemius pricing i18n adapter only on the Freemius pricing screen.
 */
function bbpa_enqueue_freemius_pricing_i18n_adapter(): void
{
    if (!is_admin() || !function_exists('bbpa_get_requested_admin_page_slug')) {
        return;
    }

    if (bbpa_get_requested_admin_page_slug() !== BBPA_SLUG . '-pricing') {
        return;
    }

    wp_enqueue_script(
        'bbpa-freemius-pricing-i18n',
        BBPA_URL . 'assets/js/freemius-pricing-i18n.js',
        [],
        BBPA_VERSION,
        true
    );

    $pricing_i18n_config = wp_json_encode(bbpa_get_freemius_pricing_i18n_config());
    if (is_string($pricing_i18n_config)) {
        wp_add_inline_script(
            'bbpa-freemius-pricing-i18n',
            'window.BPAFreemiusPricingI18n = ' . $pricing_i18n_config . ';',
            'before'
        );
    }
}

/**
 * Register BimBeau Privacy Analytics Freemius i18n hooks outside the bundled Freemius SDK.
 */
function bbpa_register_freemius_i18n_hooks(): void
{
    $freemius = bbpa_get_freemius_instance();
    if (is_object($freemius) && method_exists($freemius, 'add_filter')) {
        $freemius->add_filter('checkout/parameters', 'bbpa_filter_freemius_checkout_parameters');
    }

    add_action('admin_enqueue_scripts', 'bbpa_enqueue_freemius_pricing_i18n_adapter');
}

bbpa_register_freemius_i18n_hooks();
