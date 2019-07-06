package k.partheniadis.experimentmusion;

import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class WebGLModelActivity extends AppCompatActivity {
    public WebView webView;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_model_view);
        webView = findViewById(R.id.clayWebView);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setPluginState(WebSettings.PluginState.ON);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setAllowFileAccessFromFileURLs(true);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(true);

        //----Clay Viewer is awesome renderer but needs an extension that WebView native can't provide.
        //        webView.loadUrl("file:///android_asset/clay_viewer_fbx/examples/view.html");
        // TODO: Notice that Clay Viewer will never work with standard WebView as the error explains
        //  : "'GL_EXT_shader_texture_lod' : extension is not supported android webview" :(

        //----The WebGL library itself cant load properly the converted Koufetieres-.glTF model after converted to FBX using ClayViewerFBX.
        //REQUIRES A GL Extension which is not ever supported by Androids webview
        //        webView.loadUrl("file:///android_asset/mt_webgl_example_folder/example/koufetieres.html");

        //----Take 3:  Three.js with FBXLoader, loading koufetieres-.fbx
        webView.loadUrl("file:///android_asset/three_js/examples/webgl_loader_fbx_knife.html");
    }

    public void onBackPressed() {
        Log.d("Back:", "back pressed, activity finished. ");
        finish();
    }
}
