package app.reelnote.mobile;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reçoit le texte partagé depuis une autre app (ex. « Partager » d'Instagram)
 * et le met à disposition de la page web.
 *
 * Côté JS : getPending() renvoie { text } puis l'oublie ; l'événement « shared »
 * est émis quand un partage arrive alors que l'app est déjà ouverte.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    private static String pending = null;

    @Override
    public void load() {
        // Lancement à froid : l'intent de démarrage peut déjà contenir le partage.
        capture(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // App déjà ouverte (launchMode singleTask) : nouveau partage.
        if (capture(intent)) {
            notifyListeners("shared", new JSObject(), true);
        }
    }

    private static boolean capture(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return false;
        pending = text;
        // Évite de retraiter le même partage si l'activité est recréée.
        intent.setAction(Intent.ACTION_MAIN);
        return true;
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject ret = new JSObject();
        if (pending != null) {
            ret.put("text", pending);
            pending = null;
        }
        call.resolve(ret);
    }
}
