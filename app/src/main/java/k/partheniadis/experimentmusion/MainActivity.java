package k.partheniadis.experimentmusion;

import android.content.Intent;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.view.View;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }

    public void startMaps(View view) {
        Intent i = new Intent(this, TangramESActivity.class);
        startActivity(i);
//        finish();
    }

    public void startWebGL(View view) {
        Intent i = new Intent(this, WebGLActivity.class);
        startActivity(i);
//        finish();
    }

    public void startThreeJs(View view) {
        Intent i = new Intent(this, WebGLModelActivity.class);
        startActivity(i);
//        finish();
    }

    public void startDefSkinning(View view) {
        Intent i = new Intent(this, DefSkinning.class);
        startActivity(i);
//        finish();
    }
}
