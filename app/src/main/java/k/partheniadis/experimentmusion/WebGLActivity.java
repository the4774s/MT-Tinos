package k.partheniadis.experimentmusion;

import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.IOException;
import java.util.ArrayList;

public class WebGLActivity extends AppCompatActivity {
    public WebView webView;
    public ArrayList<String> Links = new ArrayList<String>();
    public int i = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
//        App.getComponent().inject(this);
        setContentView(R.layout.activity_webgl);
        webView = findViewById(R.id.modelWebView);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setPluginState(WebSettings.PluginState.ON);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setAllowFileAccessFromFileURLs(true);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(true);
//        webView.loadUrl("file:///android_asset/mt_webgl_example_folder/example/app_geometry.html");
        listAssetFiles("mt_webgl_example_folder/example");

    }

    public boolean listAssetFiles(String path) {

        String [] list;
        try {
            list = getAssets().list(path);
            if (list.length > 0) {
                // This is a folder
                for (String file : list) {
                    if (!listAssetFiles(path + "/" + file))
                        return false;
                    else {
                        if (file.contains(".html")) {
                            Links.add(file);
                            Log.d("Showing: ", file);
                        }else{
                            Log.d("Rejecting Non-HTML: ", file);
                        }
                        // This is a file
                        // TODO: add file name to an array list
                    }
                }
            }
        } catch (IOException e) {
            Log.d("Exception: ",e.toString());
            return false;
        }

        return true;
    }


    public void loadNext(View view) {
        if(i==Links.size()-1){
            i=0;
            Toast.makeText(this, "Starting from beginning", Toast.LENGTH_SHORT ).show();
        }else{
            i++;
        }
        String file = "file:///android_asset/mt_webgl_example_folder/example/"+Links.get(i);
        webView.loadUrl(file);
        Toast.makeText(this, i+": "+Links.get(i), Toast.LENGTH_SHORT ).show();
    }

    public void loadPrev(View view) {
        if(i==0){
            i=Links.size()-1;
            Toast.makeText(this, "Back to the end", Toast.LENGTH_SHORT ).show();
        }else{
            i--;
        }
        String file = "file:///android_asset/mt_webgl_example_folder/example/"+Links.get(i);
        webView.loadUrl(file);
        Toast.makeText(this, i+": " +Links.get(i), Toast.LENGTH_SHORT ).show();
    }
}
