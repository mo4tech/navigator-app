import { getLangNameFromCode } from 'language-name-map';
import localeEmoji from 'locale-emoji';
import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { I18nManager } from 'react-native';
import I18n from 'react-native-i18n';
import useStorage from '../hooks/use-storage';
import { navigatorConfig } from '../utils';
import { getAvailableLocales } from '../utils/localize';

I18n.fallbacks = true;
I18n.translations = {
    ...getAvailableLocales(),
};

// List of RTL language codes
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur', 'arc', 'ckb', 'dv', 'ha', 'khw', 'ks', 'ku', 'ps', 'sd', 'ug', 'yi'];

interface LanguageContextProps {
    locale: string;
    setLocale: (locale: string) => void;
    t: (key: string, options?: Record<string, any>) => string;
}

const LanguageContext = createContext<LanguageContextProps>({
    locale: 'en',
    setLocale: () => {},
    t: () => '',
});

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    const [locale, setLocaleState] = useStorage<string>('_locale', navigatorConfig('defaultLocale', 'en'));

    const languages = Object.keys(I18n.translations).map((code) => {
        return { code, ...getLangNameFromCode(code), emoji: localeEmoji(code) };
    });

    const language = useMemo(() => {
        return { code: locale, ...getLangNameFromCode(locale), emoji: localeEmoji(locale) };
    }, [locale]);

    const setLocale = (newLocale: string) => {
        I18n.locale = newLocale;
        setLocaleState(newLocale);
        
        // Force RTL layout for RTL languages
        const isRTL = RTL_LANGUAGES.includes(newLocale);
        if (I18nManager.isRTL !== isRTL) {
            I18nManager.forceRTL(isRTL);
            // Note: App needs to be reloaded for RTL changes to take effect
            // You can add RNRestart.Restart() here if you have react-native-restart installed
        }
    };

    useEffect(() => {
        I18n.locale = locale;
        
        // Set initial RTL direction based on current locale
        const isRTL = RTL_LANGUAGES.includes(locale);
        if (I18nManager.isRTL !== isRTL) {
            I18nManager.forceRTL(isRTL);
        }
    }, []);

    const t = (key: string, options?: Record<string, any>) => I18n.t(key, options);

    return <LanguageContext.Provider value={{ locale, setLocale, t, current: language, language, languages }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
    return useContext(LanguageContext);
};
